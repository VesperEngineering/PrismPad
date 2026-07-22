import config from '../src-tauri/tauri.conf.json';
import buildScript from '../src-tauri/build.rs?raw';

it('generates both configured bundle icons inside the Cargo manifest before Tauri builds', () => {
  expect(buildScript).toMatch(
    /PathBuf::from\(\s*env::var_os\("CARGO_MANIFEST_DIR"\)/
  );
  expect(buildScript).toContain('manifest_dir.join("icons").join("icon.png")');
  expect(buildScript).toContain('icon_dir.join("icon.ico")');
  expect(buildScript).toContain('fs::create_dir_all(icon_dir)');
  expect(buildScript).toContain('File::create(&icon_path)');
  expect(buildScript).toContain('File::create(&ico_path)');
  expect(buildScript).toContain('write_ico');
  expect(buildScript).not.toMatch(/current_dir|temp_dir|home_dir|fs::write/);
  expect(buildScript).toMatch(/generate_icon\(&manifest_dir\).*tauri_build::build\(\)/s);
  expect(config.bundle).toMatchObject({ icon: ['icons/icon.png', 'icons/icon.ico'] });
});
