import pathlib
import sys
import tempfile
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
import export_android_content as eac

LANGUAGE_MODULE_TEMPLATE = '''import Foundation

public struct LanguageModule: Identifiable, Sendable {{
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

    public var themes: [ConversationTheme] {{
        ConversationTheme.shared.map {{ themeOverrides[$0.id] ?? $0 }}
    }}
}}

public enum LanguageRegistry {{
    public static let defaultID = "{default_id}"
    public static let preferredID = "{preferred_id}"
    public static let all: [LanguageModule] = [{refs}]
    public static let selectable: [LanguageModule] = [{selectable}]
    public static func module(for id: String) -> LanguageModule? {{ all.first {{ $0.id == id }} }}
}}

public enum MeaningLanguages {{
    public static let all = ["English", "Spanish", "Chinese (Simplified)"]
    public static func greeting(in language: String) -> String {{
        ["English": "Hi!", "Spanish": "¡Hola!", "Chinese (Simplified)": "你好！", "Chinese": "你好！"][language] ?? "Hi!"
    }}
}}
'''

MODULE_TEMPLATE = '''import Foundation

extension LanguageModule {{
    public static let {var_name} = LanguageModule(
        id: "{id}", name: "{name}", nativeName: "{name}", variety: "Test", locale: "en",
        greeting: "Hi!", greetingWord: "hi",
        {extra}speechGuidance: "Speak clearly.",
        writingGuidance: "Write clearly.",
        lemmaGuidance: "Use base forms.",
        teachingFocus: [
            "Stage one.",
            "Stage two.", "Stage three.", "Stage four.", "Stage five.", "Stage six."
        ],
        topicPlaceholder: "Anything…",
        lookupUnavailableReply: "Not available.",
        themeOverrides: [:]
    )
}}
'''

THEMES_SWIFT = '''import Foundation

public struct ConversationTheme: Identifiable, Hashable, Sendable {
    public var id: String
    public var title: String
    public var subtitle: String
    public var symbol: String
    public var category: String
    public var situation: String
    public var colorIndex: Int
    public init(_ id: String, _ title: String, _ subtitle: String, _ symbol: String, _ category: String, _ situation: String, _ colorIndex: Int) {
        self.id = id; self.title = title; self.subtitle = subtitle; self.symbol = symbol
        self.category = category; self.situation = situation; self.colorIndex = colorIndex
    }
    public static let shared: [Self] = [
        .init("coffee", "A coffee?", "Something warm", "cup", "Everyday", "Order a drink.", 0)
    ]
    public static let variations: [String] = [
        "Speak a little faster.",
        "Add a small problem."
    ]
}
'''


def write_core(root, names, extra_by_name=None, selectable=None):
    """Write a minimal fake `Core/` tree with one Swift file per name in `names`.

    `selectable` lists the module names offered to learners; it defaults to the last module.
    """
    extra_by_name = extra_by_name or {}
    selectable = selectable or [names[-1]]
    core = root / 'Core'
    (core / 'Languages').mkdir(parents=True)
    (core / 'Themes.swift').write_text(THEMES_SWIFT)
    refs = ', '.join(f'.{n.lower()}' for n in names)
    (core / 'Languages/LanguageModule.swift').write_text(
        LANGUAGE_MODULE_TEMPLATE.format(default_id=names[0][:2].lower(), preferred_id=selectable[0][:2].lower(), refs=refs,
                                        selectable=', '.join(f'.{n.lower()}' for n in selectable)))
    for n in names:
        extra = extra_by_name.get(n, '')
        (core / 'Languages' / f'{n}.swift').write_text(
            MODULE_TEMPLATE.format(var_name=n.lower(), id=n[:2].lower(), name=n, extra=extra))
    return core


class ExportAndroidContentTests(unittest.TestCase):
    def test_incomplete_teaching_progression_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            core = write_core(pathlib.Path(tmp), ['Norwegian'])
            path = core / 'Languages/Norwegian.swift'
            path.write_text(path.read_text().replace(', "Stage six."', ''))
            with self.assertRaisesRegex(SystemExit, 'six teachingFocus'):
                eac.generate(core)

    def test_discovers_modules_in_registry_order(self):
        with tempfile.TemporaryDirectory() as tmp:
            core = write_core(pathlib.Path(tmp), ['Zulu', 'Alpha'])
            result = eac.generate(core)
            self.assertIn('val all = listOf(zulu, alpha)', result)
            self.assertLess(result.index('private val zulu'), result.index('private val alpha'))

    def test_fifth_module_appears_in_output(self):
        with tempfile.TemporaryDirectory() as tmp:
            core = write_core(pathlib.Path(tmp), ['Norwegian', 'Spanish', 'English', 'French', 'German'])
            result = eac.generate(core)
            self.assertIn('private val german = LanguageModule(', result)
            self.assertIn('val all = listOf(norwegian, spanish, english, french, german)', result)

    def test_unknown_field_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            core = write_core(pathlib.Path(tmp), ['Norwegian', 'Spanish'],
                               extra_by_name={'Spanish': 'pronunciation: "x",\n        '})
            with self.assertRaises(SystemExit) as ctx:
                eac.generate(core)
            message = str(ctx.exception)
            self.assertIn('pronunciation', message)
            self.assertIn('Languages.kt', message)

    def test_missing_module_field_names_the_field_and_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            core = write_core(pathlib.Path(tmp), ['Norwegian', 'Spanish'])
            path = core / 'Languages/Spanish.swift'
            path.write_text(path.read_text().replace('greetingWord: "hi",', ''))
            with self.assertRaises(SystemExit) as ctx:
                eac.generate(core)
            self.assertIn('greetingWord', str(ctx.exception))
            self.assertIn('Spanish.swift', str(ctx.exception))

    def test_missing_registry_is_reported(self):
        with tempfile.TemporaryDirectory() as tmp:
            core = write_core(pathlib.Path(tmp), ['Norwegian'])
            path = core / 'Languages/LanguageModule.swift'
            path.write_text(path.read_text().replace('public static let all', 'public static let every'))
            with self.assertRaises(SystemExit) as ctx:
                eac.language_files(core)
            self.assertIn('LanguageRegistry.all', str(ctx.exception))

    def test_malformed_theme_is_reported(self):
        with self.assertRaises(SystemExit) as ctx:
            eac.theme('("coffee", "A coffee?", "Something warm", "cup", "Everyday", 0)')
        self.assertIn('ConversationTheme', str(ctx.exception))

    def test_meaning_languages_and_greetings_come_from_swift(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = eac.generate(write_core(pathlib.Path(tmp), ['Norwegian']))
            self.assertIn('val all = listOf("English", "Spanish", "Chinese (Simplified)")', output)
            self.assertIn('"Chinese (Simplified)" to "你好！"', output)
            self.assertIn(')[language] ?: "Hi!"', output)

    def test_missing_meaning_languages_is_reported(self):
        with tempfile.TemporaryDirectory() as tmp:
            core = write_core(pathlib.Path(tmp), ['Norwegian'])
            path = core / 'Languages/LanguageModule.swift'
            path.write_text(path.read_text().split('public enum MeaningLanguages')[0])
            with self.assertRaises(SystemExit) as ctx:
                eac.generate(core)
            self.assertIn('MeaningLanguages', str(ctx.exception))

    def test_default_language_comes_from_the_swift_registry(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = eac.generate(write_core(pathlib.Path(tmp), ['Spanish', 'Norwegian']))
            self.assertIn('const val defaultID = "sp"', output)

    def test_selectable_and_preferred_language_come_from_the_swift_registry(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = eac.generate(write_core(pathlib.Path(tmp), ['Norwegian', 'Spanish', 'German'], selectable=['German']))
            self.assertIn('const val defaultID = "no"', output)
            self.assertIn('const val preferredID = "ge"', output)
            self.assertIn('val all = listOf(norwegian, spanish, german)', output)
            self.assertIn('val selectable = listOf(german)', output)

    def test_selectable_module_outside_the_registry_is_reported(self):
        with tempfile.TemporaryDirectory() as tmp:
            core = write_core(pathlib.Path(tmp), ['Norwegian'], selectable=['German'])
            with self.assertRaises(SystemExit) as ctx:
                eac.generate(core)
            self.assertIn('selectable', str(ctx.exception))
            self.assertIn('german', str(ctx.exception))

    def test_missing_selectable_registry_is_reported(self):
        with tempfile.TemporaryDirectory() as tmp:
            core = write_core(pathlib.Path(tmp), ['Norwegian'])
            path = core / 'Languages/LanguageModule.swift'
            path.write_text(path.read_text().replace('public static let selectable', 'public static let offered'))
            with self.assertRaises(SystemExit) as ctx:
                eac.generate(core)
            self.assertIn('LanguageRegistry.selectable', str(ctx.exception))

    def test_theme_variations_are_exported_in_order(self):
        with tempfile.TemporaryDirectory() as tmp:
            core = write_core(pathlib.Path(tmp), ['Norwegian', 'Spanish'])
            output = eac.generate(core)
            self.assertIn('    val variations = listOf(\n        "Speak a little faster.",\n        "Add a small problem."\n    )', output)

    def test_missing_theme_variations_fail(self):
        with tempfile.TemporaryDirectory() as tmp:
            core = write_core(pathlib.Path(tmp), ['Norwegian', 'Spanish'])
            themes = core / 'Themes.swift'
            themes.write_text(themes.read_text().split('    public static let variations')[0] + '}\n')
            with self.assertRaises(SystemExit):
                eac.generate(core)

    def test_generation_is_deterministic(self):
        with tempfile.TemporaryDirectory() as tmp:
            core = write_core(pathlib.Path(tmp), ['Norwegian', 'Spanish'])
            self.assertEqual(eac.generate(core), eac.generate(core))


if __name__ == '__main__':
    unittest.main()
