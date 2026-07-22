use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Condvar, Mutex,
    },
    thread,
    time::{Duration, Instant},
};

use notify::{event::ModifyKind, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

const DEBOUNCE_DELAY: Duration = Duration::from_millis(250);

pub(crate) fn debounce_delay() -> Duration {
    DEBOUNCE_DELAY
}

#[derive(Clone, Serialize)]
struct FileChangedPayload {
    path: String,
}

struct WatchEntry {
    _watcher: RecommendedWatcher,
    generation: Arc<AtomicU64>,
    active: Arc<AtomicBool>,
}

struct DebounceRequest {
    app: AppHandle,
    generation: Arc<AtomicU64>,
    active: Arc<AtomicBool>,
    event_generation: u64,
}

struct Pending<T> {
    deadline: Instant,
    request: T,
}

struct DebounceState {
    pending: Mutex<HashMap<PathBuf, Pending<DebounceRequest>>>,
    wake: Condvar,
}

/// Native watcher ownership is explicit: every canonical document path owns one
/// watcher entry until `unwatch_path` removes it.
pub struct WatchState {
    watchers: Mutex<HashMap<PathBuf, WatchEntry>>,
    debounce: Arc<DebounceState>,
}

impl Default for WatchState {
    fn default() -> Self {
        let debounce = Arc::new(DebounceState {
            pending: Mutex::new(HashMap::new()),
            wake: Condvar::new(),
        });
        let worker_state = Arc::clone(&debounce);
        thread::spawn(move || run_debounce_worker(worker_state));
        Self {
            watchers: Mutex::new(HashMap::new()),
            debounce,
        }
    }
}

pub fn require_canonical_path(path: &Path) -> Result<PathBuf, String> {
    let canonical = path
        .canonicalize()
        .map_err(|error| format!("Unable to resolve file path: {error}"))?;
    if canonical != path {
        return Err("Watcher paths must be canonical paths.".to_owned());
    }
    Ok(canonical)
}

pub fn is_relevant_event(kind: &EventKind) -> bool {
    matches!(
        kind,
        EventKind::Modify(ModifyKind::Data(_))
            | EventKind::Modify(ModifyKind::Name(_))
            | EventKind::Remove(_)
    )
}

pub(crate) fn watch_root(path: &Path) -> PathBuf {
    path.parent().unwrap_or(path).to_path_buf()
}

fn event_targets_path(paths: &[PathBuf], target: &Path) -> bool {
    paths
        .iter()
        .any(|path| path == target || path.canonicalize().ok().as_deref() == Some(target))
}

fn replace_pending<T>(
    pending: &mut HashMap<PathBuf, Pending<T>>,
    path: PathBuf,
    deadline: Instant,
    request: T,
) {
    pending.insert(path, Pending { deadline, request });
}

fn take_due<T>(pending: &mut HashMap<PathBuf, Pending<T>>, now: Instant) -> Vec<(PathBuf, T)> {
    let due_paths: Vec<PathBuf> = pending
        .iter()
        .filter_map(|(path, entry)| (entry.deadline <= now).then(|| path.clone()))
        .collect();
    due_paths
        .into_iter()
        .filter_map(|path| pending.remove(&path).map(|entry| (path, entry.request)))
        .collect()
}

fn invalidate_pending<T>(pending: &mut HashMap<PathBuf, Pending<T>>, path: &Path) {
    pending.remove(path);
}

fn schedule_emit(
    debounce: &Arc<DebounceState>,
    app: AppHandle,
    path: PathBuf,
    generation: Arc<AtomicU64>,
    active: Arc<AtomicBool>,
) {
    if !active.load(Ordering::Acquire) {
        return;
    }
    let event_generation = generation.fetch_add(1, Ordering::AcqRel) + 1;
    let mut pending = debounce
        .pending
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if !active.load(Ordering::Acquire) {
        return;
    }
    // This map has at most one entry per watched path. Replacing the entry is
    // lossless for debounce semantics and does not allocate work per event.
    replace_pending(
        &mut pending,
        path,
        Instant::now() + DEBOUNCE_DELAY,
        DebounceRequest {
            app,
            generation,
            active,
            event_generation,
        },
    );
    drop(pending);
    debounce.wake.notify_one();
}

fn run_debounce_worker(debounce: Arc<DebounceState>) {
    loop {
        let due = {
            let mut pending = debounce
                .pending
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            loop {
                let due = take_due(&mut pending, Instant::now());
                if !due.is_empty() {
                    break due;
                }
                if pending.is_empty() {
                    pending = debounce
                        .wake
                        .wait(pending)
                        .unwrap_or_else(|poisoned| poisoned.into_inner());
                } else {
                    let now = Instant::now();
                    let next_due = pending
                        .values()
                        .map(|entry| entry.deadline.saturating_duration_since(now))
                        .min()
                        .unwrap_or_default();
                    let (next_pending, _) = debounce
                        .wake
                        .wait_timeout(pending, next_due)
                        .unwrap_or_else(|poisoned| poisoned.into_inner());
                    pending = next_pending;
                }
            }
        };

        for (path, request) in due {
            if request.active.load(Ordering::Acquire)
                && request.generation.load(Ordering::Acquire) == request.event_generation
            {
                // The webview treats this as data and re-reads through the restricted file API.
                let _ = request.app.emit(
                    "file-changed",
                    FileChangedPayload {
                        path: path.to_string_lossy().into_owned(),
                    },
                );
            }
        }
    }
}

#[tauri::command]
pub fn watch_path(
    state: State<'_, WatchState>,
    app: AppHandle,
    path: String,
) -> Result<(), String> {
    let canonical = require_canonical_path(Path::new(&path))?;
    let mut watchers = state
        .watchers
        .lock()
        .map_err(|_| "File watcher state is unavailable.".to_owned())?;
    if watchers.contains_key(&canonical) {
        return Ok(());
    }

    let target = canonical.clone();
    let generation = Arc::new(AtomicU64::new(0));
    let active = Arc::new(AtomicBool::new(true));
    let callback_generation = Arc::clone(&generation);
    let callback_active = Arc::clone(&active);
    let debounce = Arc::clone(&state.debounce);
    let watcher = notify::recommended_watcher(move |event: notify::Result<notify::Event>| {
        let Ok(event) = event else {
            return;
        };
        if is_relevant_event(&event.kind) && event_targets_path(&event.paths, &target) {
            schedule_emit(
                &debounce,
                app.clone(),
                target.clone(),
                Arc::clone(&callback_generation),
                Arc::clone(&callback_active),
            );
        }
    })
    .map_err(|error| format!("Unable to start file watcher: {error}"))?;
    let mut watcher = watcher;
    watcher
        .watch(&watch_root(&canonical), RecursiveMode::NonRecursive)
        .map_err(|error| format!("Unable to watch file: {error}"))?;
    watchers.insert(
        canonical,
        WatchEntry {
            _watcher: watcher,
            generation,
            active,
        },
    );
    Ok(())
}

#[tauri::command]
pub fn unwatch_path(state: State<'_, WatchState>, path: String) -> Result<(), String> {
    let requested = PathBuf::from(path);
    let mut watchers = state
        .watchers
        .lock()
        .map_err(|_| "File watcher state is unavailable.".to_owned())?;
    if let Some(entry) = watchers.remove(&requested) {
        // Invalidate callbacks already sleeping in the debounce window before dropping the watcher.
        entry.active.store(false, Ordering::Release);
        entry.generation.fetch_add(1, Ordering::AcqRel);
        let mut pending = state
            .debounce
            .pending
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        invalidate_pending(&mut pending, &requested);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{invalidate_pending, replace_pending, take_due, Pending};
    use std::{
        collections::HashMap,
        path::PathBuf,
        time::{Duration, Instant},
    };

    #[test]
    fn coalescing_replaces_the_request_and_uses_its_latest_deadline() {
        let start = Instant::now();
        let path = PathBuf::from("/tmp/a.txt");
        let mut pending: HashMap<PathBuf, Pending<&str>> = HashMap::new();
        replace_pending(
            &mut pending,
            path.clone(),
            start + Duration::from_millis(100),
            "older",
        );
        replace_pending(
            &mut pending,
            path,
            start + Duration::from_millis(200),
            "newest",
        );

        assert!(take_due(&mut pending, start + Duration::from_millis(100)).is_empty());
        assert_eq!(
            take_due(&mut pending, start + Duration::from_millis(200))[0].1,
            "newest"
        );
    }

    #[test]
    fn a_due_path_flushes_while_other_paths_keep_receiving_events() {
        let start = Instant::now();
        let first = PathBuf::from("/tmp/a.txt");
        let due = PathBuf::from("/tmp/b.txt");
        let mut pending: HashMap<PathBuf, Pending<&str>> = HashMap::new();
        replace_pending(
            &mut pending,
            first.clone(),
            start + Duration::from_millis(50),
            "old-a",
        );
        replace_pending(
            &mut pending,
            due.clone(),
            start + Duration::from_millis(100),
            "b",
        );
        replace_pending(
            &mut pending,
            first,
            start + Duration::from_millis(300),
            "new-a",
        );

        assert_eq!(
            take_due(&mut pending, start + Duration::from_millis(100)),
            vec![(due, "b")]
        );
    }

    #[test]
    fn invalidation_removes_a_pending_request() {
        let start = Instant::now();
        let path = PathBuf::from("/tmp/a.txt");
        let mut pending: HashMap<PathBuf, Pending<&str>> = HashMap::new();
        replace_pending(&mut pending, path.clone(), start, "a");

        invalidate_pending(&mut pending, &path);

        assert!(take_due(&mut pending, start).is_empty());
    }
}
