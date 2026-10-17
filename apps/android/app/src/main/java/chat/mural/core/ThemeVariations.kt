package chat.mural.core

/**
 * This theme for its [round]-th repetition: round 0 is the plain situation, later rounds add a
 * twist from [Themes.variations]. Every twist is used once before any repeats; the per-theme offset
 * keeps two themes from walking through the twists in the same order.
 * Mirrors `ConversationTheme.varied(round:)` in apps/ios/Core/Themes.swift.
 */
fun ConversationTheme.varied(round: Int): ConversationTheme {
    if (round <= 0 || id == "current" || Themes.variations.isEmpty()) return this
    val offset = id.sumOf { it.code }
    return copy(situation = situation + " This time: " + Themes.variations[(round - 1 + offset) % Themes.variations.size])
}
