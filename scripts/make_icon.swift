// Renders the Halani brand artwork: a rounded lowercase "h" whose stem ends in a speech-bubble tail,
// with a glowing rose voice dot, on burgundy. The in-app wordmark repeats the same dot over the "i".
// Usage: swift scripts/make_icon.swift <output-directory>
// Writes app-icon.png (1024 px, opaque), monochrome.png (512 px, white mark on transparent)
// and store-icon.png (512 px, RGBA as Google Play requires).
import AppKit
import ImageIO
import SwiftUI
import UniformTypeIdentifiers

func rgb(_ r: Double, _ g: Double, _ b: Double) -> Color { Color(red: r / 255, green: g / 255, blue: b / 255) }
let iconBackground = rgb(30, 12, 21)        // #1E0C15, also the Android adaptive-icon background
let burgundy = rgb(128, 16, 47), ink = rgb(255, 247, 240), rose = rgb(211, 143, 164), accent = rgb(229, 160, 181)

/// The "h": stem and arch built from rounded strokes, plus a tail at the stem's foot.
/// Coordinates are in a 100 × 100 unit box so every output size shares one geometry.
struct SpeechH: Shape {
    func path(in rect: CGRect) -> Path {
        let u = min(rect.width, rect.height) / 100
        func pt(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: rect.minX + x * u, y: rect.minY + y * u) }
        let stroke: CGFloat = 15 * u
        // Stem: x 30–45, from the rounded top (y 18) down to y 76, where the tail takes over the foot.
        var stem = Path()
        stem.addRoundedRect(in: CGRect(origin: pt(30, 18), size: CGSize(width: stroke, height: 58 * u)),
                            cornerRadii: RectangleCornerRadii(topLeading: stroke / 2, bottomLeading: 0, bottomTrailing: 0, topTrailing: stroke / 2))
        // Arch and right leg: one rounded stroke from the stem through the shoulder to the right foot.
        var arch = Path()
        arch.move(to: pt(37.5, 56))
        arch.addCurve(to: pt(55, 41), control1: pt(37.5, 46), control2: pt(45, 41))
        arch.addCurve(to: pt(70.5, 56), control1: pt(65, 41), control2: pt(70.5, 47))
        arch.addLine(to: pt(70.5, 74.5))
        let archShape = arch.strokedPath(StrokeStyle(lineWidth: stroke, lineCap: .round, lineJoin: .round))
        // Speech-bubble tail: grows from the stem's left edge down to a point at the lower left,
        // then sweeps back into the stem's rounded foot.
        var tail = Path()
        tail.move(to: pt(30, 72))
        tail.addQuadCurve(to: pt(24, 89), control: pt(30, 82))
        tail.addQuadCurve(to: pt(25.5, 90), control: pt(24, 90.5))
        tail.addCurve(to: pt(45, 76), control1: pt(33, 86.8), control2: pt(45, 84.5))
        tail.addLine(to: pt(45, 72))
        tail.closeSubpath()
        // Union keeps overlaps solid; plain addPath would punch holes under even-odd filling.
        return stem.union(archShape).union(tail)
    }
}

struct Mark: View {
    let canvas: CGFloat
    var monochrome = false
    var body: some View {
        let u = canvas / 100
        ZStack(alignment: .topLeading) {
            if !monochrome {
                RadialGradient(colors: [burgundy, iconBackground], center: .center, startRadius: 0, endRadius: canvas * 0.72)
            }
            SpeechH().fill(monochrome ? Color.white : ink)
            // Voice dot: soft glow first, then the dot itself.
            if !monochrome {
                Circle().fill(accent.opacity(0.55)).frame(width: 15 * u, height: 15 * u).blur(radius: 3.5 * u)
                    .offset(x: 59.5 * u, y: 18.5 * u)
            }
            Circle().fill(monochrome ? AnyShapeStyle(Color.white) : AnyShapeStyle(RadialGradient(colors: [accent, rose],
                center: UnitPoint(x: 0.35, y: 0.3), startRadius: 0, endRadius: 7 * u)))
                .frame(width: 12 * u, height: 12 * u).offset(x: 61 * u, y: 20 * u)
        }
        .frame(width: canvas, height: canvas)
        .background(monochrome ? Color.clear : iconBackground)
    }
}

@MainActor func render(_ view: some View, size: CGFloat, opaque: Bool) -> CGImage {
    let renderer = ImageRenderer(content: view.frame(width: size, height: size))
    renderer.scale = 1; renderer.isOpaque = opaque
    guard let image = renderer.cgImage else { fatalError("Rendering failed") }
    let width = Int(size)
    let info = opaque ? CGImageAlphaInfo.noneSkipLast.rawValue : CGImageAlphaInfo.premultipliedLast.rawValue
    guard let context = CGContext(data: nil, width: width, height: width, bitsPerComponent: 8, bytesPerRow: width * 4,
                                  space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: info) else { fatalError("No bitmap context") }
    context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: width))
    return context.makeImage()!
}

func save(_ image: CGImage, to url: URL) {
    guard let destination = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil) else { fatalError("Cannot write \(url.path)") }
    CGImageDestinationAddImage(destination, image, nil)
    guard CGImageDestinationFinalize(destination) else { fatalError("Could not save \(url.path)") }
}

guard CommandLine.arguments.count == 2 else { fatalError("Usage: swift scripts/make_icon.swift <output-directory>") }
let output = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
MainActor.assumeIsolated {
    save(render(Mark(canvas: 1024), size: 1024, opaque: true), to: output.appendingPathComponent("app-icon.png"))
    save(render(Mark(canvas: 512, monochrome: true), size: 512, opaque: false), to: output.appendingPathComponent("monochrome.png"))
    save(render(Mark(canvas: 512), size: 512, opaque: false), to: output.appendingPathComponent("store-icon.png"))
}
print("Created Halani app icon, monochrome layer and store icon in \(output.path)")
