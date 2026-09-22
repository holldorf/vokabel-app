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
    static let name = "Deutsch mit Dr. Holldorf"
    static let tagline = "Für deinen Alltag in der Pflege."
}

struct Brand: View {
    var body: some View {
        HStack(spacing: 8) {
            Image("HolldorfLogo")
                .resizable()
                .scaledToFit()
                .frame(width: 36, height: 36)
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                .accessibilityHidden(true)
            Text("Deutsch mit\nDr. Holldorf").font(.system(.headline, design: .rounded, weight: .bold))
                .fixedSize(horizontal: false, vertical: true)
        }.foregroundStyle(MuralColor.ink).accessibilityElement(children: .ignore).accessibilityLabel(AppBrand.name)
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

struct OrbShape: Shape {
    var phase: Double
    var energy: Double
    func path(in rect: CGRect) -> Path {
        let points = (0..<12).map { index -> CGPoint in
            let a = Double(index) / 12 * .pi * 2
            let wave = sin(a * 3 + phase) * 0.021 + cos(a * 2 - phase * 0.7) * (0.012 + energy * 0.025)
            let radius = min(rect.width, rect.height) * (0.47 + wave)
            return CGPoint(x: rect.midX + cos(a) * radius, y: rect.midY + sin(a) * radius)
        }
        var p = Path()
        for i in 0..<12 {
            let current = points[i], next = points[(i + 1) % 12]
            let midpoint = CGPoint(x: (current.x + next.x) / 2, y: (current.y + next.y) / 2)
            if i == 0 {
                let previous = points[11]
                p.move(to: CGPoint(x: (previous.x + current.x) / 2, y: (previous.y + current.y) / 2))
            }
            p.addQuadCurve(to: midpoint, control: current)
        }
        p.closeSubpath(); return p
    }
}

struct MuralOrb: View {
    var energy: Double = 0
    var listening = false
    var active = true
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30, paused: reduceMotion || !active || scenePhase != .active)) { timeline in
            let t = reduceMotion ? 0 : timeline.date.timeIntervalSinceReferenceDate
            let phase = t * 0.72
            let e = reduceMotion ? 0 : min(1, max(0, energy))
            GeometryReader { geometry in
                let side = min(geometry.size.width, geometry.size.height)
                ZStack {
                    Ellipse().fill(MuralColor.orange.opacity(0.14)).frame(width: side * 0.57, height: side * 0.075)
                        .blur(radius: 10).offset(y: side * 0.47)
                    Circle().stroke(MuralColor.orange.opacity(listening ? 0.18 : 0), lineWidth: 1).padding(-6)
                    Circle().stroke(MuralColor.orange.opacity(listening ? 0.10 : 0), lineWidth: 1).padding(-16)
                    ZStack {
                        MeshGradient(width: 3, height: 3, points: [
                            [0,0], [0.5,0], [1,0],
                            [0,0.5], [Float(0.5 + sin(phase) * 0.08), Float(0.5 + cos(phase) * 0.06)], [1,0.5],
                            [0,1], [0.5,1], [1,1]
                        ], colors: [MuralColor.ink, MuralColor.accent, MuralColor.rose,
                                    MuralColor.rose, MuralColor.burgundy, MuralColor.accent,
                                    MuralColor.burgundy, MuralColor.orange, MuralColor.rose])
                        Ellipse().fill(.white.opacity(0.65)).frame(width: side * 0.48, height: side * 0.15).blur(radius: 13)
                            .rotationEffect(.degrees(-28)).offset(x: -side * 0.17, y: -side * 0.28)
                        Ellipse().stroke(MuralColor.butter.opacity(0.48), lineWidth: 16).frame(width: side * 1.2, height: side * 0.5)
                            .blur(radius: 12).rotationEffect(.degrees(-15)).offset(y: side * 0.54)
                    }
                    .mask(OrbShape(phase: phase, energy: e))
                    .shadow(color: MuralColor.orange.opacity(0.12), radius: 16, y: 10)
                    .rotationEffect(.degrees(sin(phase * 0.5) * 3))
                    .scaleEffect(1 + e * 0.045)
                    .offset(y: reduceMotion ? 0 : sin(t * 0.9) * 4 - 5)
                    Circle().fill(RadialGradient(colors: [MuralColor.ink, MuralColor.rose, MuralColor.burgundy.opacity(0.5)], center: .topLeading, startRadius: 0, endRadius: 12))
                        .frame(width: 12, height: 12).offset(x: side * 0.55, y: -side * 0.24)
                    Circle().fill(MuralColor.rose).frame(width: 7, height: 7).offset(x: -side * 0.54, y: side * 0.26)
                }.frame(width: side, height: side).frame(maxWidth: .infinity, maxHeight: .infinity)
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
