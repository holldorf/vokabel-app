package chat.mural.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

class ThemeVariationsTest {
    @Test fun repeatingAThemeUsesEveryTwistBeforeAnyRepeats() {
        val german = LanguageRegistry.get("de")!!
        val count = Themes.variations.size
        assertTrue(count >= 10)
        for (theme in german.themes) {
            assertSame(theme, theme.varied(0))
            val rounds = (1..count).map { theme.varied(it).situation }
            assertEquals(theme.id, count, rounds.toSet().size)
            assertTrue(theme.id, rounds.all { it.startsWith(theme.situation + " This time: ") })
            assertEquals(theme.id, theme.varied(1), theme.varied(count + 1))
            val varied = theme.varied(4)
            assertTrue(theme.id, TeachingPolicy.voice(german, LearningEngine.project(emptyList(), "de"), varied, "", "English").contains(varied.situation))
        }
        val current = ConversationTheme("current", "Topic", "From the world today", "newspaper", "Interests", "Sourced notes.", 0)
        assertSame(current, current.varied(3))
    }

    @Test fun twistOrderMatchesIOS() {
        // ThemeConversationTests.swift asserts the identical text.
        assertEquals("Meet in a neighbourhood café in Germany. Order a drink and chat. Use polite greetings with staff and follow the learner's interests. This time: Bring in one unexpected small problem halfway through.",
            LanguageRegistry.get("de")!!.themes.first { it.id == "coffee" }.varied(1).situation)
    }
}
