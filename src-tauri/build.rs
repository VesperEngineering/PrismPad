use std::{
    env,
    error::Error,
    fs::{self, File},
    io::{BufWriter, Write},
    path::{Path, PathBuf},
};

use png::{BitDepth, ColorType, Encoder};

const ICON_SIZE: u32 = 256;
type Rgba = [u8; 4];

struct Canvas {
    pixels: Vec<u8>,
}

impl Canvas {
    fn new(color: Rgba) -> Self {
        let mut pixels = vec![0; (ICON_SIZE * ICON_SIZE * 4) as usize];
        for pixel in pixels.chunks_exact_mut(4) {
            pixel.copy_from_slice(&color);
        }
        Self { pixels }
    }

    fn set_pixel(&mut self, x: i32, y: i32, color: Rgba) {
        if x < 0 || y < 0 || x >= ICON_SIZE as i32 || y >= ICON_SIZE as i32 {
            return;
        }

        let offset = ((y as u32 * ICON_SIZE + x as u32) * 4) as usize;
        self.pixels[offset..offset + 4].copy_from_slice(&color);
    }
}

fn fill_rectangle(canvas: &mut Canvas, x: i32, y: i32, width: i32, height: i32, color: Rgba) {
    for pixel_y in y..y + height {
        for pixel_x in x..x + width {
            canvas.set_pixel(pixel_x, pixel_y, color);
        }
    }
}

fn edge(a: (i32, i32), b: (i32, i32), point: (i32, i32)) -> i32 {
    (point.0 - a.0) * (b.1 - a.1) - (point.1 - a.1) * (b.0 - a.0)
}

fn fill_triangle(canvas: &mut Canvas, a: (i32, i32), b: (i32, i32), c: (i32, i32), color: Rgba) {
    let min_x = a.0.min(b.0).min(c.0);
    let max_x = a.0.max(b.0).max(c.0);
    let min_y = a.1.min(b.1).min(c.1);
    let max_y = a.1.max(b.1).max(c.1);
    let clockwise = edge(a, b, c) < 0;

    for y in min_y..=max_y {
        for x in min_x..=max_x {
            let inside = [edge(a, b, (x, y)), edge(b, c, (x, y)), edge(c, a, (x, y))]
                .into_iter()
                .all(|value| if clockwise { value <= 0 } else { value >= 0 });
            if inside {
                canvas.set_pixel(x, y, color);
            }
        }
    }
}

fn fill_ray(canvas: &mut Canvas, x: i32, y: i32, width: i32, color: Rgba) {
    fill_rectangle(canvas, x, y, width, 5, color);
}

fn generate_icon(manifest_dir: &Path) -> Result<(), Box<dyn Error>> {
    let icon_path = manifest_dir.join("icons").join("icon.png");
    let icon_dir = icon_path
        .parent()
        .expect("icon path has a parent directory");
    fs::create_dir_all(icon_dir)?;

    let mut canvas = Canvas::new([20, 22, 29, 255]);
    fill_rectangle(&mut canvas, 52, 32, 152, 192, [247, 241, 230, 255]);
    fill_ray(&mut canvas, 70, 70, 116, [239, 112, 101, 255]);
    fill_ray(&mut canvas, 70, 88, 116, [92, 205, 218, 255]);
    fill_ray(&mut canvas, 70, 168, 116, [184, 165, 230, 255]);
    fill_ray(&mut canvas, 70, 186, 116, [242, 207, 99, 255]);
    fill_triangle(
        &mut canvas,
        (128, 96),
        (86, 160),
        (170, 160),
        [105, 112, 121, 255],
    );
    fill_triangle(
        &mut canvas,
        (128, 96),
        (128, 160),
        (170, 160),
        [78, 84, 93, 255],
    );

    let png_bytes = encode_png(&canvas)?;
    let mut icon_file = BufWriter::new(File::create(&icon_path)?);
    icon_file.write_all(&png_bytes)?;
    icon_file.flush()?;

    let ico_path = icon_dir.join("icon.ico");
    write_ico(File::create(&ico_path)?, &png_bytes)?;
    Ok(())
}

fn encode_png(canvas: &Canvas) -> Result<Vec<u8>, Box<dyn Error>> {
    let mut png_bytes = Vec::new();
    let mut encoder = Encoder::new(&mut png_bytes, ICON_SIZE, ICON_SIZE);
    encoder.set_color(ColorType::Rgba);
    encoder.set_depth(BitDepth::Eight);
    let mut writer = encoder.write_header()?;
    writer.write_image_data(&canvas.pixels)?;
    Ok(png_bytes)
}

fn write_ico(mut ico_file: File, png_bytes: &[u8]) -> Result<(), Box<dyn Error>> {
    ico_file.write_all(&[0, 0, 1, 0, 1, 0])?;
    ico_file.write_all(&[0, 0, 0, 0, 1, 0, 32, 0])?;
    ico_file.write_all(&(png_bytes.len() as u32).to_le_bytes())?;
    ico_file.write_all(&22_u32.to_le_bytes())?;
    ico_file.write_all(png_bytes)?;
    ico_file.flush()?;
    Ok(())
}

fn main() {
    let manifest_dir = PathBuf::from(
        env::var_os("CARGO_MANIFEST_DIR").expect("Cargo provides CARGO_MANIFEST_DIR"),
    );
    generate_icon(&manifest_dir).expect("PrismPad icon generation failed");
    tauri_build::build();
}
