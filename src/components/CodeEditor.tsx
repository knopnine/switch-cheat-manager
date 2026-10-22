import { useEffect, useRef } from "react";
import { Compartment, EditorState } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  keymap,
  lineNumbers,
  highlightActiveLineGutter,
  type DecorationSet,
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { MergeView } from "@codemirror/merge";
import { parseCheats, editorText, applyEditorChanges } from "../core/documents";
const headers = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }
    update(update: { docChanged: boolean; view: EditorView }) {
      if (update.docChanged) this.decorations = this.build(update.view);
    }
    build(view: EditorView) {
      return Decoration.set(
        parseCheats(view.state.doc.toString()).nodes.map((n) =>
          Decoration.line({
            class: `cheat-line ${n.enabled ? "enabled" : n.kind}`,
          }).range(view.state.doc.line(n.line).from),
        ),
        true,
      );
    }
  },
  { decorations: (value) => value.decorations },
);
const base = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "0.875rem",
    backgroundColor: "var(--editor)",
    color: "var(--text)",
  },
  ".cm-scroller": {
    overflow: "auto",
    fontFamily: "ui-monospace, Consolas, monospace",
  },
  ".cm-content": { padding: "16px 0", caretColor: "var(--text)" },
  ".cm-gutters": {
    backgroundColor: "var(--surface)",
    color: "var(--muted)",
    borderRight: "1px solid var(--border)",
  },
  "&.cm-focused": { outline: "2px solid var(--accent)", outlineOffset: "-2px" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
    backgroundColor: "var(--selection)",
  },
  ".cm-cursor": { borderLeftColor: "var(--text)" },
  ".cm-searchMatch": { backgroundColor: "#d6a90055" },
});
export function CodeEditor({
  value,
  onChange,
  readOnly = false,
  reveal,
  label,
}: {
  value: string;
  onChange?: (text: string) => void;
  readOnly?: boolean;
  reveal?: { line: number; nonce: number };
  label: string;
}) {
  const host = useRef<HTMLDivElement>(null),
    view = useRef<EditorView>(null),
    callback = useRef(onChange),
    syncing = useRef(false),
    lock = useRef(new Compartment());
  callback.current = onChange;
  const raw = useRef(value);
  useEffect(() => {
    const editor = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: editorText(value),
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          history(),
          highlightSelectionMatches(),
          keymap.of([
            ...defaultKeymap,
            ...historyKeymap,
            ...searchKeymap,
            indentWithTab,
          ]),
          headers,
          base,
          lock.current.of([
            EditorState.readOnly.of(readOnly),
            EditorView.editable.of(!readOnly),
          ]),
          EditorView.contentAttributes.of({ "aria-label": label }),
          EditorView.updateListener.of((u) => {
            if (u.docChanged && !syncing.current) {
              const changes: { from: number; to: number; insert: string }[] =
                [];
              u.changes.iterChanges((from, to, _fromB, _toB, inserted) =>
                changes.push({ from, to, insert: inserted.toString() }),
              );
              raw.current = applyEditorChanges(raw.current, changes);
              callback.current?.(raw.current);
            }
          }),
        ],
      }),
    });
    view.current = editor;
    return () => {
      editor.destroy();
      view.current = null;
    };
  }, []);
  useEffect(() => {
    const editor = view.current;
    raw.current = value;
    if (editor && editor.state.doc.toString() !== editorText(value)) {
      syncing.current = true;
      editor.dispatch({
        changes: {
          from: 0,
          to: editor.state.doc.length,
          insert: editorText(value),
        },
      });
      syncing.current = false;
    }
  }, [value]);
  useEffect(() => {
    view.current?.dispatch({
      effects: lock.current.reconfigure([
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
      ]),
    });
  }, [readOnly]);
  useEffect(() => {
    const editor = view.current;
    if (editor && reveal) {
      const line = editor.state.doc.line(
        Math.min(reveal.line, editor.state.doc.lines),
      );
      editor.dispatch({
        selection: { anchor: line.from },
        effects: EditorView.scrollIntoView(line.from, { y: "center" }),
      });
      editor.focus();
    }
  }, [reveal]);
  return <div className="code-editor" ref={host} />;
}
export function Comparison({ left, right }: { left: string; right: string }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const merge = new MergeView({
      parent: host.current!,
      a: {
        doc: left,
        extensions: [
          lineNumbers(),
          base,
          EditorState.readOnly.of(true),
          EditorView.editable.of(false),
          EditorView.contentAttributes.of({ "aria-label": "Left comparison" }),
        ],
      },
      b: {
        doc: right,
        extensions: [
          lineNumbers(),
          base,
          EditorState.readOnly.of(true),
          EditorView.editable.of(false),
          EditorView.contentAttributes.of({ "aria-label": "Right comparison" }),
        ],
      },
      highlightChanges: true,
      gutter: true,
    });
    return () => merge.destroy();
  }, [left, right]);
  return <div className="comparison" ref={host} />;
}
