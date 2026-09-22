package chat.mural.ui

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import org.junit.Assert.assertTrue
import org.junit.Test

class BrandPaletteTest {
    private fun contrast(first: Color, second: Color): Float {
        val a = first.luminance()
        val b = second.luminance()
        return (maxOf(a, b) + .05f) / (minOf(a, b) + .05f)
    }

    @Test fun textAndLinksRemainReadableOnEveryDarkSurface() {
        val surfaces = listOf(MuralColors.Cream, MuralColors.CreamRaised,
            MuralColors.Surface, MuralColors.SurfaceBright) + MuralColors.Panels
        for (surface in surfaces) {
            for (text in listOf(MuralColors.Ink, MuralColors.Secondary, MuralColors.Accent, MuralColors.Red)) {
                assertTrue("Text $text against $surface needs 4.5:1 contrast", contrast(text, surface) >= 4.5f)
            }
            assertTrue("The theme must remain dark", surface.luminance() < .06f)
        }
    }

    @Test fun filledActionsAndFieldBordersHaveEnoughContrast() {
        assertTrue(contrast(MuralColors.Ink, MuralColors.Orange) >= 4.5f)
        assertTrue(contrast(MuralColors.Ink, MuralColors.Burgundy) >= 4.5f)
        assertTrue(contrast(MuralColors.Cream, MuralColors.Accent) >= 4.5f)
        assertTrue(contrast(MuralColors.Border, MuralColors.Surface) >= 3f)
    }
}
