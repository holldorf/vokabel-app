package chat.mural

import android.graphics.Bitmap
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.StateRestorationTester
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import chat.mural.ui.MuralSplash
import chat.mural.ui.MuralStartup
import chat.mural.ui.MuralTheme
import java.io.File
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class MuralSplashTest {
    @get:Rule val compose = createComposeRule()

    @Test fun localHistoryGatesContentAndCompletedStartupSurvivesRecreation() {
        val loading = mutableStateOf(true)
        val restoration = StateRestorationTester(compose)
        restoration.setContent { MuralTheme {
            MuralStartup(loading.value, minimumDurationMillis = 0) {
                Text("Ready", Modifier.testTag("startup-content"))
            }
        } }
        compose.onNodeWithTag("mural-splash").assertIsDisplayed()
        compose.onNodeWithTag("startup-content").assertDoesNotExist()
        compose.runOnIdle { loading.value = false }
        compose.waitUntil { compose.onAllNodesWithTag("startup-content").fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithTag("mural-splash").assertDoesNotExist()
        compose.runOnIdle { loading.value = true }
        restoration.emulateSavedInstanceStateRestore()
        compose.onNodeWithTag("startup-content").assertIsDisplayed()
        compose.onNodeWithTag("mural-splash").assertDoesNotExist()
    }

    @Test fun splashContainsOnlyTheLogoAndItsPulseChangesTheRenderedFrame() {
        val phase = mutableStateOf(0f)
        compose.setContent { MuralTheme { MuralSplash(phaseOverride = phase.value) } }
        compose.onNodeWithTag("mural-splash").assertIsDisplayed()
        compose.onAllNodes(SemanticsMatcher.keyIsDefined(SemanticsProperties.Text)).assertCountEquals(0)
        compose.onAllNodes(hasClickAction()).assertCountEquals(0)
        val resting = capture("splash-logo-rest.png")
        compose.runOnIdle { phase.value = .62831855f }
        val expanded = capture("splash-logo-pulse.png")
        assertFalse("The pulse must visibly change the logo", resting.sameAs(expanded))
    }

    @Test fun compactWindowKeepsTheLogoCenteredAndInsideTheSplash() {
        compose.setContent { MuralTheme {
            Box(Modifier.size(320.dp, 180.dp)) { MuralSplash(phaseOverride = 0f) }
        } }
        val splash = compose.onNodeWithTag("mural-splash").fetchSemanticsNode().boundsInRoot
        val logo = compose.onNodeWithTag("mural-splash-logo", useUnmergedTree = true).fetchSemanticsNode().boundsInRoot
        assertTrue(logo.left > splash.left && logo.right < splash.right)
        assertTrue(logo.top > splash.top && logo.bottom < splash.bottom)
        assertEquals(splash.center.x, logo.center.x, 1f)
        assertEquals(splash.center.y, logo.center.y, 1f)
    }

    private fun capture(name: String): Bitmap {
        val bitmap = compose.onNodeWithTag("mural-splash").captureToImage().asAndroidBitmap()
        val directory = File(InstrumentationRegistry.getInstrumentation().targetContext.filesDir, "splash-review").apply { mkdirs() }
        File(directory, name).outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        return bitmap
    }
}
