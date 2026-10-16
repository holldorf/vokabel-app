import Foundation

/// A target language's content and teaching policy. IDs are stable storage keys.
public struct LanguageModule: Identifiable, Sendable {
    public let id: String
    public let name: String
    public let nativeName: String
    public let variety: String
    public let locale: String
    public let greeting: String
    public let greetingWord: String
    public let speechGuidance: String
    public let writingGuidance: String
    public let lemmaGuidance: String
    public let teachingFocus: [String]
    public let topicPlaceholder: String
    public let lookupUnavailableReply: String
    public let themeOverrides: [String: ConversationTheme]

    public var themes: [ConversationTheme] {
        ConversationTheme.shared.map { themeOverrides[$0.id] ?? $0 }
    }
    public var defaultTitle: String { "A little \(name)" }
    public var talkTitle: String { "A little everyday \(name)" }
    public var settingsTitle: String { "\(name) · \(variety)" }
}

public enum LanguageRegistry {
    /// Language assigned to version 1 archives during migration. Never change: it is a storage key.
    public static let defaultID = "nb"
    /// Language a fresh install starts with. This fork is for care workers learning German.
    public static let preferredID = "de"
    /// Every module that can open an existing learning record. Storage validation uses this list.
    public static let all: [LanguageModule] = [.norwegian, .spanish, .english, .french, .german, .italian, .portuguese, .mandarin, .serbian, .greek, .tagalog, .dutch, .russian]
    /// Modules a learner may pick in onboarding and Settings. Only German is offered in this fork.
    public static let selectable: [LanguageModule] = [.german]
    public static func module(for id: String) -> LanguageModule? { all.first { $0.id == id } }
}

public enum MeaningLanguages {
    public static let all = ["English", "French", "German", "Spanish", "Norwegian", "Portuguese", "Italian", "Chinese (Simplified)", "Polish", "Arabic", "Ukrainian", "Serbian (Latin)", "Greek", "Tagalog (Filipino)", "Dutch", "Russian", "Vietnamese", "Turkish", "Romanian", "Hindi", "Croatian", "Albanian"]
    public static func greeting(in language: String) -> String {
        ["English": "Hi!", "French": "Salut !", "German": "Hallo!", "Spanish": "¡Hola!", "Norwegian": "Hei!", "Portuguese": "Olá!", "Italian": "Ciao!", "Chinese (Simplified)": "你好！", "Chinese": "你好！", "Polish": "Cześć!", "Arabic": "مرحبًا!", "Ukrainian": "Привіт!", "Serbian (Latin)": "Zdravo!", "Greek": "Γεια σου!", "Tagalog (Filipino)": "Kumusta!", "Dutch": "Hoi!", "Russian": "Привет!", "Vietnamese": "Xin chào!", "Turkish": "Merhaba!", "Romanian": "Salut!", "Hindi": "नमस्ते!", "Croatian": "Bok!", "Albanian": "Përshëndetje!"][language] ?? "Hi!"
    }
}
