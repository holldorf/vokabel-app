package chat.mural.ui

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.Text
import androidx.compose.material3.Typography
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import chat.mural.R
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

object MuralColors {
    // Legacy token names are retained so all existing screens share the theme.
    val Cream = Color(0xFF180A10)
    val CreamRaised = Color(0xFF251019)
    val Surface = Color(0xFF32131F)
    val SurfaceBright = Color(0xFF482032)
    val Ink = Color(0xFFFFF7F0)
    val Secondary = Color(0xFFD6B9C3)
    val Orange = Color(0xFFB94B70)
    val Peach = Color(0xFF482032)
    val Lilac = Color(0xFF392139)
    val Sage = Color(0xFF3C2730)
    val Butter = Color(0xFF512133)
    val Red = Color(0xFFFFB4AB)
    val Border = Color(0xFF946575)
    val Burgundy = Color(0xFF80102F)
    val Rose = Color(0xFFD38FA4)
    val Accent = Color(0xFFE5A0B5)
    val Panels = listOf(Peach, Lilac, Sage, Butter)
}

private val MuralScheme = darkColorScheme(
    primary = MuralColors.Accent,
    onPrimary = MuralColors.Cream,
    primaryContainer = MuralColors.Peach,
    onPrimaryContainer = MuralColors.Ink,
    secondary = MuralColors.Secondary,
    background = MuralColors.Cream,
    onBackground = MuralColors.Ink,
    surface = MuralColors.Surface,
    onSurface = MuralColors.Ink,
    surfaceVariant = MuralColors.SurfaceBright,
    onSurfaceVariant = MuralColors.Secondary,
    outline = MuralColors.Border,
    outlineVariant = MuralColors.Border.copy(alpha = .55f),
    surfaceContainerLowest = MuralColors.Cream,
    surfaceContainerLow = MuralColors.CreamRaised,
    surfaceContainer = MuralColors.Surface,
    surfaceContainerHigh = MuralColors.SurfaceBright,
    surfaceContainerHighest = MuralColors.Butter,
    error = MuralColors.Red,
    onError = MuralColors.Cream,
    errorContainer = MuralColors.Peach,
    onErrorContainer = MuralColors.Red,
)

@OptIn(androidx.compose.ui.text.ExperimentalTextApi::class)
val MuralRounded = FontFamily(
    *listOf(400, 500, 600, 700, 800).map { weight ->
        androidx.compose.ui.text.font.Font(R.font.nunito, FontWeight(weight),
            variationSettings = androidx.compose.ui.text.font.FontVariation.Settings(
                androidx.compose.ui.text.font.FontVariation.weight(weight)))
    }.toTypedArray(),
)

private fun rounded(size: Int, height: Int, weight: FontWeight = FontWeight.Normal, tracking: Float = 0f) =
    TextStyle(fontFamily = MuralRounded, fontSize = size.sp, lineHeight = height.sp, fontWeight = weight, letterSpacing = tracking.sp)

private val MuralTypography = Typography(
    displayLarge = rounded(60, 72, FontWeight.Medium, -2f),
    displayMedium = rounded(48, 56, FontWeight.Medium, -1.5f),
    displaySmall = rounded(38, 44, FontWeight.Medium, -1f),
    headlineLarge = rounded(34, 39, FontWeight.SemiBold, -1f),
    headlineMedium = rounded(27, 33, FontWeight.Medium, -.5f),
    headlineSmall = rounded(24, 30, FontWeight.SemiBold, -.4f),
    titleLarge = rounded(22, 28, FontWeight.SemiBold, -.35f),
    titleMedium = rounded(17, 23, FontWeight.SemiBold),
    titleSmall = rounded(15, 21, FontWeight.SemiBold),
    bodyLarge = rounded(17, 25),
    bodyMedium = rounded(15, 22),
    bodySmall = rounded(13, 18),
    labelLarge = rounded(16, 22, FontWeight.SemiBold),
    labelMedium = rounded(13, 18, FontWeight.SemiBold),
    labelSmall = rounded(11, 15, FontWeight.Medium),
)

@Composable
fun MuralTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = MuralScheme, typography = MuralTypography,
        shapes = androidx.compose.material3.Shapes(
            extraSmall = androidx.compose.foundation.shape.RoundedCornerShape(12.dp),
            small = androidx.compose.foundation.shape.RoundedCornerShape(18.dp),
            medium = androidx.compose.foundation.shape.RoundedCornerShape(22.dp),
            large = androidx.compose.foundation.shape.RoundedCornerShape(28.dp),
            extraLarge = androidx.compose.foundation.shape.RoundedCornerShape(36.dp)), content = content)
}

/** Decorative inside a parent that supplies the accessible app name. */
@Composable
fun BrandMark(modifier: Modifier = Modifier) {
    Image(
        painter = painterResource(R.drawable.brand_logo),
        contentDescription = null,
        modifier = modifier.clip(RoundedCornerShape(percent = 22)),
    )
}

@Composable
fun Brand(modifier: Modifier = Modifier) {
    val appName = stringResource(R.string.app_name)
    Row(modifier = modifier.semantics(mergeDescendants = true) { contentDescription = appName },
        horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        BrandMark(Modifier.size(36.dp))
        Wordmark()
    }
}

/** "halani" with the dot of the final i drawn as the rose voice dot from the app icon. Decorative. */
@Composable
fun Wordmark(modifier: Modifier = Modifier) {
    val style = rounded(18, 22, FontWeight.ExtraBold)
    Row(modifier.clearAndSetSemantics { }, verticalAlignment = Alignment.Bottom) {
        Text("halan", style = style, color = MuralColors.Ink)
        Box(contentAlignment = Alignment.TopCenter) {
            // U+0131 (dotless i), so the voice dot replaces the glyph's own dot.
            Text("\u0131", style = style, color = MuralColors.Ink)
            Box(Modifier.offset(y = 2.dp).size(6.dp).background(MuralColors.Rose, CircleShape))
        }
    }
}

@Composable
fun PageHeading(eyebrow: String, title: String, subtitle: String = "", modifier: Modifier = Modifier) {
    androidx.compose.foundation.layout.Column(modifier, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(eyebrow.uppercase(), style = MaterialTheme.typography.labelSmall, color = MuralColors.Secondary, letterSpacing = 1.5.sp)
        Text(title, style = MaterialTheme.typography.headlineLarge)
        if (subtitle.isNotBlank()) Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = MuralColors.Secondary)
    }
}

/** Motion follows the app lifecycle and Android's system animation setting. */
@Composable
internal fun muralPhase(active: Boolean = true, slow: Boolean = false): Float {
    val owner = androidx.lifecycle.compose.LocalLifecycleOwner.current
    var foreground by androidx.compose.runtime.remember { androidx.compose.runtime.mutableStateOf(
        owner.lifecycle.currentState.isAtLeast(androidx.lifecycle.Lifecycle.State.STARTED)) }
    var animations by androidx.compose.runtime.remember { androidx.compose.runtime.mutableStateOf(android.animation.ValueAnimator.areAnimatorsEnabled()) }
    androidx.compose.runtime.DisposableEffect(owner) {
        val observer = androidx.lifecycle.LifecycleEventObserver { _, _ ->
            foreground = owner.lifecycle.currentState.isAtLeast(androidx.lifecycle.Lifecycle.State.STARTED)
            animations = android.animation.ValueAnimator.areAnimatorsEnabled()
        }
        owner.lifecycle.addObserver(observer)
        onDispose { owner.lifecycle.removeObserver(observer) }
    }
    if (!active || !foreground || !animations || chat.mural.BuildConfig.BUILD_TYPE == "uiTest") return 0f
    val phase by rememberInfiniteTransition(label = "Halani motion").animateFloat(
        initialValue = 0f, targetValue = (PI * 40).toFloat(),
        animationSpec = infiniteRepeatable(tween(if (slow) 897_597 else 174_533,
            easing = androidx.compose.animation.core.LinearEasing), RepeatMode.Restart), label = "Halani phase")
    return phase
}

@Composable
fun SoftAnimatedBackground(modifier: Modifier = Modifier) {
    val phase = muralPhase(slow = true)
    Canvas(modifier) {
        drawRect(MuralColors.Cream)
        drawRect(Brush.radialGradient(listOf(MuralColors.Butter.copy(alpha = .55f), MuralColors.Butter.copy(alpha = 0f)),
            Offset(size.width * (.32f + sin(phase) * .10f), size.height * .22f), size.width * .85f))
        drawRect(Brush.radialGradient(listOf(MuralColors.Peach.copy(alpha = .70f), MuralColors.Peach.copy(alpha = 0f)),
            Offset(size.width * (.52f + cos(phase) * .12f), size.height * (.47f + sin(phase) * .04f)), size.width * .9f))
        drawRect(Brush.radialGradient(listOf(MuralColors.Lilac.copy(alpha = .45f), MuralColors.Lilac.copy(alpha = 0f)),
            Offset(size.width * .95f, size.height * (.56f + cos(phase) * .06f)), size.width * .8f))
    }
}

/**
 * Halani's speaking visual: a glowing aura ring. A soft halo in rose, accent, pink and cream slowly
 * orbits the ring, and both halo and ring swell with the voice level ([energy], 0..1).
 * The name stays `MuralOrb` so upstream call sites keep working.
 */
@Composable
fun MuralOrb(energy: Float = 0f, listening: Boolean = false, active: Boolean = true, modifier: Modifier = Modifier) {
    val phase = muralPhase(active)
    val motion = android.animation.ValueAnimator.areAnimatorsEnabled()
    val power = if (motion) energy.coerceIn(0f, 1f) else 0f
    Canvas(modifier) {
        val side = minOf(size.width, size.height)
        val seconds = phase / .72f                       // muralPhase advances .72 rad per second
        val breath = (sin(seconds * 1.1f) + 1f) / 2f * .06f   // idle breath while nobody speaks
        val swell = maxOf(power, breath)
        val scale = .92f + .12f * swell
        val radius = side * .36f * scale
        val center = Offset(size.width / 2, size.height / 2)
        val halo = Brush.sweepGradient(listOf(MuralColors.Rose, MuralColors.Accent, MuralColors.Orange, MuralColors.Ink, MuralColors.Rose), center)
        val haloWidth = side * (.06f + .08f * swell) * scale
        withTransform({ rotate(seconds * 60f, center) }) {
            // Layered strokes stand in for a blur: wide and faint outside, narrower and brighter inside.
            for (step in 0 until 10) {
                val k = step / 9f                       // 0 = widest, faintest … 1 = narrowest, brightest
                drawCircle(halo, radius, center, alpha = .05f + .09f * k, style = Stroke(haloWidth * (2.8f - 2.3f * k)))
            }
        }
        drawCircle(MuralColors.Ink.copy(alpha = .85f), radius, center, style = Stroke(maxOf(1.dp.toPx(), side * .012f * scale)))
        if (listening) {
            drawCircle(MuralColors.Accent.copy(alpha = .22f), radius * 1.18f, center, style = Stroke(1.dp.toPx()))
        }
    }
}

@Composable
fun RecallBars(count: Int, modifier: Modifier = Modifier) {
    val desc = stringResource(R.string.words_recall_bars_desc, count)
    Row(
        modifier.semantics { contentDescription = desc },
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        repeat(3) { index ->
            Spacer(
                Modifier
                    .size(width = 18.dp, height = 6.dp)
                    .background(if (index < count) MuralColors.Orange else MuralColors.Peach, CircleShape),
            )
        }
    }
}
