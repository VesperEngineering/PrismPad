use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File},
    io::{Read, Write},
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};
use tempfile::NamedTempFile;

pub const MAX_TEXT_FILE_SIZE: u64 = 20 * 1024 * 1024;
const BINARY_PROBE_SIZE: usize = 8192;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum LineEnding {
    Lf,
    Crlf,
}

#[derive(Debug, thiserror::Error)]
pub enum FileError {
    #[error("This appears to be a binary file and cannot be opened as text.")]
    Binary,
    #[error("PrismPad v1 supports UTF-8 text files only.")]
    UnsupportedEncoding,
    #[error("The file changed on disk after it was opened.")]
    Conflict,
    #[error("This file is larger than 20 MiB. Confirm before opening it.")]
    LargeFile { size: u64 },
    #[error("File operation failed: {0}")]
    Io(String),
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CommandError {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<u64>,
}

impl From<FileError> for CommandError {
    fn from(error: FileError) -> Self {
        let code = match &error {
            FileError::Binary => "binary",
            FileError::UnsupportedEncoding => "unsupported_encoding",
            FileError::Conflict => "conflict",
            FileError::LargeFile { .. } => "large_file",
            FileError::Io(_) => "io",
        };
        let size = match &error {
            FileError::LargeFile { size } => Some(*size),
            _ => None,
        };

        Self {
            code: code.to_owned(),
            message: error.to_string(),
            size,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct ParsedText {
    pub text: String,
    pub bom: bool,
    pub line_ending: LineEnding,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DiskMetadata {
    pub path: String,
    pub modified_ms: u64,
    pub size: u64,
    pub revision: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ReadFileResult {
    #[serde(flatten)]
    pub metadata: DiskMetadata,
    pub text: String,
    pub encoding: String,
    pub bom: bool,
    pub line_ending: LineEnding,
    pub large: bool,
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WriteFileRequest {
    pub path: String,
    pub text: String,
    pub bom: bool,
    pub line_ending: LineEnding,
    pub expected_modified_ms: Option<u64>,
    pub expected_size: Option<u64>,
    pub expected_revision: Option<String>,
}

pub fn parse_text(bytes: &[u8]) -> Result<ParsedText, FileError> {
    if bytes.iter().take(BINARY_PROBE_SIZE).any(|byte| *byte == 0) {
        return Err(FileError::Binary);
    }

    let (bom, body) = if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        (true, &bytes[3..])
    } else {
        (false, bytes)
    };
    let text = std::str::from_utf8(body)
        .map_err(|_| FileError::UnsupportedEncoding)?
        .to_owned();
    let line_ending = if text.contains("\r\n") {
        LineEnding::Crlf
    } else {
        LineEnding::Lf
    };

    Ok(ParsedText {
        text,
        bom,
        line_ending,
    })
}

pub fn encode_text(text: &str, line_ending: LineEnding) -> Vec<u8> {
    let normalized = text.replace("\r\n", "\n").replace('\r', "\n");
    match line_ending {
        LineEnding::Lf => normalized.into_bytes(),
        LineEnding::Crlf => normalized.replace('\n', "\r\n").into_bytes(),
    }
}

pub fn atomic_write(
    path: &Path,
    text: &str,
    bom: bool,
    line_ending: LineEnding,
) -> Result<(), FileError> {
    let expected_target = if path.exists() {
        let snapshot = snapshot_file(path, true, false)?;
        ExpectedTarget::Existing {
            modified_ms: snapshot.metadata.modified_ms,
            size: snapshot.metadata.size,
            revision: snapshot.metadata.revision,
        }
    } else {
        ExpectedTarget::Missing
    };
    atomic_write_checked(path, text, bom, line_ending, &expected_target)
}

#[derive(Debug, Clone, PartialEq)]
struct FileVersion {
    modified_ms: u64,
    size: u64,
}

#[derive(Debug)]
struct FileSnapshot {
    metadata: DiskMetadata,
    version: FileVersion,
    permissions: fs::Permissions,
    bytes: Vec<u8>,
}

#[derive(Debug)]
enum ExpectedTarget {
    Missing,
    Existing {
        modified_ms: u64,
        size: u64,
        revision: String,
    },
}

#[derive(Debug, PartialEq)]
enum BoundedRead {
    Complete,
    Exceeded,
}

fn atomic_write_checked(
    path: &Path,
    text: &str,
    bom: bool,
    line_ending: LineEnding,
    expected_target: &ExpectedTarget,
) -> Result<(), FileError> {
    let parent = path.parent().ok_or_else(|| {
        FileError::Io("save path has no parent directory".to_owned())
    })?;
    let parent_sync = prepare_parent_directory_sync(path)?;
    let mut temporary = NamedTempFile::new_in(parent).map_err(io_error)?;
    let mut bytes = Vec::with_capacity(text.len() + usize::from(bom) * 3);
    if bom {
        bytes.extend_from_slice(&[0xEF, 0xBB, 0xBF]);
    }
    bytes.extend(encode_text(text, line_ending));

    temporary
        .as_file_mut()
        .write_all(&bytes)
        .map_err(io_error)?;
    temporary.as_file_mut().flush().map_err(io_error)?;
    temporary.as_file().sync_all().map_err(io_error)?;
    let permissions = verify_expected_target(path, expected_target)?;
    if let Some(permissions) = permissions {
        temporary
            .as_file()
            .set_permissions(permissions)
            .map_err(io_error)?;
        temporary.as_file().sync_all().map_err(io_error)?;
    }

    match expected_target {
        ExpectedTarget::Missing => temporary.persist_noclobber(path).map_err(persist_error)?,
        ExpectedTarget::Existing { .. } => temporary.persist(path).map_err(persist_error)?,
    };
    // The replacement is committed at this point. A late directory-sync error must
    // not be reported as a failed save; callers may safely retry only failed writes.
    let _ = sync_parent_directory_handle(&parent_sync);
    Ok(())
}

#[tauri::command]
pub fn read_text_file(path: String, allow_large: bool) -> Result<ReadFileResult, CommandError> {
    read_text_file_impl(Path::new(&path), allow_large).map_err(CommandError::from)
}

fn read_text_file_impl(path: &Path, allow_large: bool) -> Result<ReadFileResult, FileError> {
    let canonical_path = canonical_existing_file(path)?;
    let snapshot = snapshot_file(&canonical_path, allow_large, true)?;
    let parsed = parse_text(&snapshot.bytes)?;
    Ok(ReadFileResult {
        metadata: snapshot.metadata,
        text: parsed.text,
        encoding: "utf-8".to_owned(),
        bom: parsed.bom,
        line_ending: parsed.line_ending,
        large: snapshot.version.size > MAX_TEXT_FILE_SIZE,
    })
}

#[tauri::command]
pub fn write_text_file(request: WriteFileRequest) -> Result<DiskMetadata, CommandError> {
    write_text_file_impl(request).map_err(CommandError::from)
}

fn write_text_file_impl(request: WriteFileRequest) -> Result<DiskMetadata, FileError> {
    let canonical_path = canonical_save_path(Path::new(&request.path))?;
    let expected_target = if canonical_path.exists() {
        ExpectedTarget::Existing {
            modified_ms: request.expected_modified_ms.ok_or(FileError::Conflict)?,
            size: request.expected_size.ok_or(FileError::Conflict)?,
            revision: request.expected_revision.ok_or(FileError::Conflict)?,
        }
    } else {
        ExpectedTarget::Missing
    };

    atomic_write_checked(
        &canonical_path,
        &request.text,
        request.bom,
        request.line_ending,
        &expected_target,
    )?;
    Ok(snapshot_file(&canonical_path, true, false)?.metadata)
}

fn canonical_existing_file(path: &Path) -> Result<PathBuf, FileError> {
    let canonical_path = fs::canonicalize(path).map_err(io_error)?;
    if !fs::metadata(&canonical_path).map_err(io_error)?.is_file() {
        return Err(FileError::Io("path does not point to a regular file".to_owned()));
    }
    Ok(canonical_path)
}

fn canonical_save_path(path: &Path) -> Result<PathBuf, FileError> {
    if path.exists() {
        return canonical_existing_file(path);
    }

    let name = path
        .file_name()
        .filter(|name| !name.is_empty())
        .ok_or_else(|| FileError::Io("save path has no file name".to_owned()))?;
    let parent = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    let canonical_parent = fs::canonicalize(parent).map_err(io_error)?;
    if !fs::metadata(&canonical_parent).map_err(io_error)?.is_dir() {
        return Err(FileError::Io("save path parent is not a directory".to_owned()));
    }
    Ok(canonical_parent.join(name))
}

fn file_metadata(path: &Path) -> Result<FileVersion, FileError> {
    metadata_version(fs::metadata(path).map_err(io_error)?)
}

fn metadata_version(metadata: fs::Metadata) -> Result<FileVersion, FileError> {
    let modified_ms = metadata
        .modified()
        .map_err(io_error)?
        .duration_since(UNIX_EPOCH)
        .map_err(|error| FileError::Io(error.to_string()))?
        .as_millis()
        .try_into()
        .map_err(|_| FileError::Io("file modification timestamp is out of range".to_owned()))?;
    Ok(FileVersion {
        modified_ms,
        size: metadata.len(),
    })
}

fn snapshot_file(
    path: &Path,
    allow_large: bool,
    check_binary: bool,
) -> Result<FileSnapshot, FileError> {
    let mut file = File::open(path).map_err(io_error)?;
    let before = metadata_version(file.metadata().map_err(io_error)?)?;
    let mut bytes = vec![0; before.size.min(BINARY_PROBE_SIZE as u64) as usize];
    file.read_exact(&mut bytes).map_err(io_error)?;
    if check_binary && bytes.contains(&0) {
        return Err(FileError::Binary);
    }
    if before.size > MAX_TEXT_FILE_SIZE && !allow_large {
        return Err(FileError::LargeFile { size: before.size });
    }
    let exceeded = if before.size <= MAX_TEXT_FILE_SIZE {
        read_bounded(&mut file, &mut bytes, MAX_TEXT_FILE_SIZE)? == BoundedRead::Exceeded
    } else {
        file.read_to_end(&mut bytes).map_err(io_error)?;
        false
    };
    let after = metadata_version(file.metadata().map_err(io_error)?)?;
    if exceeded && !allow_large {
        return Err(FileError::LargeFile {
            size: after.size.max(bytes.len() as u64),
        });
    }
    if before != after {
        return Err(FileError::Conflict);
    }
    if exceeded {
        return Err(FileError::Conflict);
    }

    Ok(FileSnapshot {
        metadata: DiskMetadata {
            path: path.to_string_lossy().into_owned(),
            modified_ms: after.modified_ms,
            size: after.size,
            revision: content_revision(&bytes),
        },
        version: after,
        permissions: file.metadata().map_err(io_error)?.permissions(),
        bytes,
    })
}

fn read_bounded<R: Read>(
    reader: &mut R,
    bytes: &mut Vec<u8>,
    cap: u64,
) -> Result<BoundedRead, FileError> {
    if bytes.len() as u64 > cap {
        return Ok(BoundedRead::Exceeded);
    }
    let remaining_with_sentinel = cap
        .checked_sub(bytes.len() as u64)
        .and_then(|remaining| remaining.checked_add(1))
        .ok_or_else(|| FileError::Io("bounded read limit overflowed".to_owned()))?;
    reader
        .take(remaining_with_sentinel)
        .read_to_end(bytes)
        .map_err(io_error)?;
    Ok(if bytes.len() as u64 > cap {
        BoundedRead::Exceeded
    } else {
        BoundedRead::Complete
    })
}

fn verify_expected_target(
    path: &Path,
    expected_target: &ExpectedTarget,
) -> Result<Option<fs::Permissions>, FileError> {
    match expected_target {
        ExpectedTarget::Missing => {
            if path.exists() {
                Err(FileError::Conflict)
            } else {
                Ok(None)
            }
        }
        ExpectedTarget::Existing {
            modified_ms,
            size,
            revision,
        } => {
            let snapshot = snapshot_file(path, true, false)?;
            if snapshot.metadata.modified_ms != *modified_ms
                || snapshot.metadata.size != *size
                || snapshot.metadata.revision != *revision
            {
                return Err(FileError::Conflict);
            }
            Ok(Some(snapshot.permissions))
        }
    }
}

pub fn content_revision(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

#[cfg(unix)]
fn prepare_parent_directory_sync(path: &Path) -> Result<File, FileError> {
    let parent = path.parent().ok_or_else(|| {
        FileError::Io("save path has no parent directory".to_owned())
    })?;
    File::open(parent).map_err(io_error)
}

#[cfg(not(unix))]
fn prepare_parent_directory_sync(_path: &Path) -> Result<(), FileError> {
    Ok(())
}

#[cfg(unix)]
fn sync_parent_directory_handle(directory: &File) -> Result<(), FileError> {
    directory.sync_all().map_err(io_error)
}

#[cfg(not(unix))]
fn sync_parent_directory_handle(_directory: &()) -> Result<(), FileError> {
    Ok(())
}

fn persist_error(error: tempfile::PersistError) -> FileError {
    if error.error.kind() == std::io::ErrorKind::AlreadyExists {
        FileError::Conflict
    } else {
        io_error(error.error)
    }
}

fn io_error(error: std::io::Error) -> FileError {
    FileError::Io(error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn detects_utf8_bom_and_crlf() {
        let parsed = parse_text(&[0xEF, 0xBB, 0xBF, b'a', b'\r', b'\n']).unwrap();
        assert!(parsed.bom);
        assert_eq!(parsed.line_ending, LineEnding::Crlf);
        assert_eq!(parsed.text, "a\r\n");
    }

    #[test]
    fn produces_a_stable_sha256_revision_for_exact_file_bytes() {
        assert_eq!(
            content_revision(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn bounded_reader_reads_at_most_one_byte_past_the_cap() {
        let mut reader = Cursor::new(b"cdefgh".to_vec());
        let mut bytes = b"ab".to_vec();

        assert_eq!(
            read_bounded(&mut reader, &mut bytes, 4).unwrap(),
            BoundedRead::Exceeded
        );
        assert_eq!(bytes, b"abcde");
    }

    #[test]
    fn rejects_nul_in_first_eight_kibibytes() {
        assert!(matches!(parse_text(b"abc\0def"), Err(FileError::Binary)));
    }

    #[test]
    fn normalizes_lone_carriage_returns_before_encoding_crlf() {
        assert_eq!(
            encode_text("a\r\nb\rc\n", LineEnding::Crlf),
            b"a\r\nb\r\nc\r\n"
        );
    }

    #[test]
    fn round_trip_preserves_bom_and_crlf() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("sample.txt");
        atomic_write(&path, "a\nb\n", true, LineEnding::Crlf).unwrap();
        assert_eq!(std::fs::read(path).unwrap(), b"\xEF\xBB\xBFa\r\nb\r\n");
    }

    #[test]
    fn read_rejects_large_files_without_loading_the_whole_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("large.txt");
        std::fs::write(&path, vec![b'a'; MAX_TEXT_FILE_SIZE as usize + 1]).unwrap();

        assert!(matches!(
            read_text_file(path.to_string_lossy().into_owned(), false),
            Err(error) if error.code == "large_file" && error.size == Some(MAX_TEXT_FILE_SIZE + 1)
        ));
    }

    #[test]
    fn read_returns_canonical_path() {
        let dir = tempfile::tempdir().unwrap();
        let folder = dir.path().join("folder");
        std::fs::create_dir(&folder).unwrap();
        let path = folder.join("note.txt");
        std::fs::write(&path, "note").unwrap();

        let result = read_text_file(
            folder
                .join(".")
                .join("note.txt")
                .to_string_lossy()
                .into_owned(),
            false,
        )
        .unwrap();
        assert_eq!(
            result.path,
            std::fs::canonicalize(path)
                .unwrap()
                .to_string_lossy()
                .into_owned()
        );
        assert_eq!(result.revision, content_revision(b"note"));
    }

    #[test]
    fn write_rejects_changed_same_size_content_when_metadata_matches() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("note.txt");
        std::fs::write(&path, "same").unwrap();
        let expected_revision = content_revision(b"same");
        std::fs::write(&path, "diff").unwrap();
        let current = file_metadata(&path).unwrap();

        let request = WriteFileRequest {
            path: path.to_string_lossy().into_owned(),
            text: "editor text".to_owned(),
            bom: false,
            line_ending: LineEnding::Lf,
            expected_modified_ms: Some(current.modified_ms),
            expected_size: Some(current.size),
            expected_revision: Some(expected_revision),
        };
        assert!(matches!(
            write_text_file(request),
            Err(error) if error.code == "conflict"
        ));
        assert_eq!(std::fs::read_to_string(path).unwrap(), "diff");
    }

    #[cfg(unix)]
    #[test]
    fn atomic_write_preserves_existing_permissions() {
        use std::os::unix::fs::PermissionsExt;

        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("private.txt");
        std::fs::write(&path, "before").unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o640)).unwrap();

        atomic_write(&path, "after", false, LineEnding::Lf).unwrap();

        assert_eq!(
            std::fs::metadata(path).unwrap().permissions().mode() & 0o777,
            0o640
        );
    }

    #[cfg(unix)]
    #[test]
    fn syncs_the_parent_directory_after_replacing_a_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("synced.txt");
        std::fs::write(&path, "before").unwrap();

        let parent_sync = prepare_parent_directory_sync(&path).unwrap();
        atomic_write(&path, "after", false, LineEnding::Lf).unwrap();

        assert!(sync_parent_directory_handle(&parent_sync).is_ok());
    }

    #[test]
    fn command_errors_are_serialized_with_code_and_message() {
        let serialized = serde_json::to_value(CommandError::from(FileError::Binary)).unwrap();
        assert_eq!(serialized["code"], "binary");
        assert_eq!(
            serialized["message"],
            "This appears to be a binary file and cannot be opened as text."
        );
    }
}
