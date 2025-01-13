import * as vscode from "vscode";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { get_config_checking } from "./global";

const styles: { [key: string]: string } = {
    Compress: `---
BasedOnStyle: LLVM
AccessModifierOffset: 0
AlignAfterOpenBracket: DontAlign
AlignArrayOfStructures: None
AlignConsecutiveAssignments: None
AlignConsecutiveBitFields: None
AlignConsecutiveDeclarations: None
AlignConsecutiveMacros: None
AlignEscapedNewlines: DontAlign
AlignOperands: DontAlign
AlignTrailingComments: false
AllowAllArgumentsOnNextLine: false
AllowAllParametersOfDeclarationOnNextLine: false
AllowShortBlocksOnASingleLine: Always
AllowShortCaseLabelsOnASingleLine: true
AllowShortEnumsOnASingleLine: true
AllowShortFunctionsOnASingleLine: All
AllowShortIfStatementsOnASingleLine: AllIfsAndElse
AllowShortLambdasOnASingleLine: All
AllowShortLoopsOnASingleLine: true
AlwaysBreakAfterReturnType: None
AlwaysBreakBeforeMultilineStrings: false
AlwaysBreakTemplateDeclarations: No
AttributeMacros:
BinPackArguments: true
BinPackParameters: true
BitFieldColonSpacing: None
BreakBeforeBinaryOperators: NonAssignment
BreakBeforeBraces: Custom
BreakBeforeConceptDeclarations: false
BreakBeforeTernaryOperators: true
BreakConstructorInitializers: BeforeColon
BreakInheritanceList: BeforeColon
BreakStringLiterals: false
ColumnLimit: 0
CompactNamespaces: true
ConstructorInitializerIndentWidth: 0
ContinuationIndentWidth: 0
Cpp11BracedListStyle: true
DeriveLineEnding: false
DerivePointerAlignment: false
DisableFormat: false
EmptyLineAfterAccessModifier: Never
EmptyLineBeforeAccessModifier: Never
FixNamespaceComments: false
IndentAccessModifiers: false
IndentCaseBlocks: true
IndentCaseLabels: false
IndentExternBlock: NoIndent
IndentGotoLabels: false
IndentPPDirectives: None
IndentRequires: false
IndentWidth: 0
IndentWrappedFunctionNames: false
KeepEmptyLinesAtTheStartOfBlocks: false
LambdaBodyIndentation: OuterScope
Language: Cpp
MaxEmptyLinesToKeep: 0
NamespaceIndentation: None
PPIndentWidth: 0
PackConstructorInitializers: BinPack
PenaltyBreakAssignment: 1000
PenaltyBreakBeforeFirstCallParameter: 1000
PenaltyBreakComment: 1
PenaltyBreakFirstLessLess: 1000
PenaltyBreakString: 1
PenaltyBreakTemplateDeclaration: 1000
PenaltyExcessCharacter: 0
PenaltyIndentedWhitespace: 1000
PenaltyReturnTypeOnItsOwnLine: 0
PointerAlignment: Left
ReferenceAlignment: Left
ReflowComments: false
ShortNamespaceLines: 100000
SortIncludes: Never
SortUsingDeclarations: false
SpaceAfterCStyleCast: false
SpaceAfterLogicalNot: false
SpaceAfterTemplateKeyword: false
SpaceAroundPointerQualifiers: Default
SpaceBeforeAssignmentOperators: false
SpaceBeforeCaseColon: false
SpaceBeforeCpp11BracedList: false
SpaceBeforeCtorInitializerColon: false
SpaceBeforeInheritanceColon: false
SpaceBeforeParens: Never
SpaceBeforeRangeBasedForLoopColon: false
SpaceBeforeSquareBrackets: false
SpaceInEmptyBlock: false
SpaceInEmptyParentheses: false
SpacesBeforeTrailingComments: 0
SpacesInAngles: Never
SpacesInCStyleCastParentheses: false
SpacesInConditionalStatement: false
SpacesInParentheses: false
SpacesInSquareBrackets: false
Standard: Latest
TabWidth: 0
UseCRLF: false
UseTab: Never
BraceWrapping:
    AfterCaseLabel: false
    AfterClass: false
    AfterControlStatement: Never
    AfterEnum: false
    AfterFunction: false
    AfterNamespace: false
    AfterStruct: false
    AfterUnion: false
    AfterExternBlock: false
    BeforeCatch: false
    BeforeElse: false
    BeforeLambdaBody: false
    BeforeWhile: false
    IndentBraces: false
    SplitEmptyFunction: false
    SplitEmptyRecord: false
    SplitEmptyNamespace: false
`,
    LLVM: `---
BasedOnStyle: LLVM
`,
    Google: `---
BasedOnStyle: Google
`,
    Chromium: `---
BasedOnStyle: Chromium
`,
    Mozilla: `---
BasedOnStyle: Mozilla
`,
    WebKit: `---
BasedOnStyle: WebKit
`,
    Microsoft: `---
BasedOnStyle: Microsoft
`,
    GNU: `---
BasedOnStyle: GNU
`,
};

export async function format_code(dirpath: string, source_code: string) {
    const format_style = get_config_checking<string>("formatStyle");
    if (format_style === "Never") {
        return source_code;
    }
    const elements = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const rndname = Array.from(crypto.randomFillSync(new Uint8Array(32)))
        .map((n) => elements[n % elements.length])
        .join("");
    const working_dir = path.join(dirpath, `/${rndname}`);
    await fs.promises.mkdir(path.join(working_dir, "/.vscode"), { recursive: true });
    const promises = [];
    promises.push(fs.promises.writeFile(path.join(working_dir, "/compressed.cpp"), source_code, "utf-8"));
    promises.push(fs.promises.writeFile(path.join(working_dir, "/.vscode/settings.json"), '{"editor.defaultFormatter": "ms-vscode.cpptools","C_Cpp.clang_format_style": "file"}', "utf-8"));
    if (format_style !== "Inherit") {
        promises.push(fs.promises.writeFile(path.join(working_dir, "/.clang-format"), styles[format_style], "utf-8"));
    }
    await Promise.all(promises);
    try {
        const uri = vscode.Uri.file(path.join(working_dir, "/compressed.cpp"));
        const document = await vscode.workspace.openTextDocument(uri);
        const edits: vscode.TextEdit[] | undefined = await vscode.commands.executeCommand("vscode.executeFormatDocumentProvider", uri, {});
        if (edits && edits.length > 0) {
            const workspaceEdit = new vscode.WorkspaceEdit();
            for (const edit of edits) {
                workspaceEdit.replace(uri, edit.range, edit.newText);
            }
            const success = await vscode.workspace.applyEdit(workspaceEdit);
            if (success) {
                await document.save();
            }
        }
    } catch {}
    const result = await fs.promises.readFile(path.join(working_dir, "/compressed.cpp"), "utf-8");
    await fs.promises.rm(working_dir, { recursive: true });
    return "/* This code was formatted by `clang-format` and `online-judge-extension`. */\n" + result;
}
