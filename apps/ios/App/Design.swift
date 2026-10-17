import SwiftUI

enum MuralColor {
    // Keep the existing token names so every screen adopts the company theme.
    static let cream = Color(red: 24/255, green: 10/255, blue: 16/255)
    static let ink = Color(red: 255/255, green: 247/255, blue: 240/255)
    static let secondary = Color(red: 214/255, green: 185/255, blue: 195/255)
    static let orange = Color(red: 185/255, green: 75/255, blue: 112/255)
    static let peach = Color(red: 72/255, green: 32/255, blue: 50/255)
    static let lilac = Color(red: 57/255, green: 33/255, blue: 57/255)
    static let sage = Color(red: 60/255, green: 39/255, blue: 48/255)
    static let butter = Color(red: 81/255, green: 33/255, blue: 51/255)
    static let surface = Color(red: 50/255, green: 19/255, blue: 31/255)
    static let border = Color(red: 148/255, green: 101/255, blue: 117/255)
    static let burgundy = Color(red: 128/255, green: 16/255, blue: 47/255)
    static let rose = Color(red: 211/255, green: 143/255, blue: 164/255)
    static let accent = Color(red: 229/255, green: 160/255, blue: 181/255)
    static let panels = [peach, lilac, sage, butter]
}

enum AppBrand {
    static let name = "Halani"
    static let tagline = "Für deinen Alltag in der Pflege."
}

struct Brand: View {
    var body: some View {
        HStack(spacing: 8) {
            Image("BrandLogo")
                .resizable()
                .scaledToFit()
                .frame(width: 36, height: 36)
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                .accessibilityHidden(true)
            Wordmark()
        }.foregroundStyle(MuralColor.ink).accessibilityElement(children: .ignore).accessibilityLabel(AppBrand.name)
    }
}

/// "halani" with the dot of the final i drawn as the rose voice dot from the app icon.
/// Decorative: the parent supplies the accessible name.
struct Wordmark: View {
    var body: some View {
        let font = Font.system(.headline, design: .rounded, weight: .bold)
        HStack(spacing: 0) {
            Text("halan").font(font)
            // U+0131 (dotless i), so the voice dot replaces the glyph's own dot.
            Text("\u{0131}").font(font).overlay(alignment: .top) {
                GeometryReader { geometry in
                    let side = geometry.size.height * 0.22
                    Circle().fill(MuralColor.rose).shadow(color: MuralColor.accent.opacity(0.7), radius: side * 0.5)
                        .frame(width: side, height: side)
                        .position(x: geometry.size.width / 2, y: geometry.size.height * 0.24)
                }
            }
        }
        .fixedSize(horizontal: false, vertical: true)
        .accessibilityHidden(true)
    }
}

struct SoftGlass: ViewModifier {
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    var tint: Color = MuralColor.surface
    func body(content: Content) -> some View {
        if reduceTransparency { content.background(MuralColor.surface, in: Capsule()) }
        else { content.glassEffect(.regular.tint(tint).interactive(), in: .capsule) }
    }
}

/// Halani's speaking visual: a glowing aura ring. A soft halo in rose, accent, pink and cream slowly
/// orbits the ring, and both halo and ring swell with the voice level (`energy`, 0…1).
/// The name stays `MuralOrb` so upstream call sites keep working.
struct MuralOrb: View {
    var energy: Double = 0
    var listening = false
    var active = true
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30, paused: reduceMotion || !active || scenePhase != .active)) { timeline in
            let t = reduceMotion ? 0 : timeline.date.timeIntervalSinceReferenceDate
            let e = reduceMotion ? 0 : min(1, max(0, energy))
            // A gentle idle breath keeps the ring alive while nobody is speaking.
            let breath = reduceMotion ? 0 : (sin(t * 1.1) + 1) / 2 * 0.06
            GeometryReader { geometry in
                let side = min(geometry.size.width, geometry.size.height)
                let ring = side * 0.72
                ZStack {
                    Circle().stroke(AngularGradient(colors: [MuralColor.rose, MuralColor.accent, MuralColor.orange, MuralColor.ink, MuralColor.rose],
                                                    center: .center, angle: .degrees(t * 60)),
                                    lineWidth: side * (0.06 + 0.08 * max(e, breath)))
                        .frame(width: ring, height: ring).blur(radius: side * 0.05)
                    Circle().stroke(MuralColor.ink.opacity(0.85), lineWidth: max(1, side * 0.012)).frame(width: ring, height: ring)
                    // Listening: a faint outer ring, as the orb had.
                    Circle().stroke(MuralColor.accent.opacity(listening ? 0.22 : 0), lineWidth: 1).frame(width: ring * 1.18, height: ring * 1.18)
                }
                .scaleEffect(0.92 + 0.12 * max(e, breath))
                .frame(width: side, height: side).frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }.accessibilityHidden(true)
    }
}

struct RecallBars: View {
    let count: Int
    var body: some View {
        HStack(spacing: 4) {
            ForEach(0..<3) { index in Capsule().fill(index < count ? MuralColor.orange : MuralColor.peach).frame(width: 18, height: 6) }
        }.accessibilityLabel("\(count) of 3 recall bars")
    }
}

struct PageHeading: View {
    var eyebrow: String
    var title: String
    var subtitle: String = ""
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(eyebrow.uppercased()).font(.system(.caption, design: .rounded, weight: .medium)).tracking(1.5).foregroundStyle(MuralColor.secondary)
            Text(title).font(.system(.largeTitle, design: .rounded, weight: .semibold)).tracking(-1).foregroundStyle(MuralColor.ink)
            if !subtitle.isEmpty { Text(subtitle).font(.subheadline).foregroundStyle(MuralColor.secondary) }
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
}
