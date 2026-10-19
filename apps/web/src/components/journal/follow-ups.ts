import { EditorState, StateEffect, StateField, Transaction } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType } from "@codemirror/view";
import type { DecorationSet } from "@codemirror/view";
import * as Y from "yjs";

import { FOLLOW_UPS } from "@/lib/journal-document";
import type { FollowUp } from "@/lib/journal-document";

// Shows a follow-up as two lines of blue text: the response, then the question.
class FollowUpWidget extends WidgetType {
  readonly followUp: FollowUp;

  constructor(followUp: FollowUp) {
    super();
    this.followUp = followUp;
  }

  eq(other: FollowUpWidget) {
    return (
      other.followUp.response === this.followUp.response &&
      other.followUp.question === this.followUp.question
    );
  }

  toDOM() {
    const element = document.createElement("div");
    element.className = "text-blue-600 dark:text-blue-400";
    for (const text of [this.followUp.response, this.followUp.question]) {
      const line = document.createElement("div");
      line.textContent = text;
      element.append(line);
    }
    return element;
  }
}

function followUpDecorations(doc: Y.Doc, length: number) {
  return Decoration.set(
    doc.getArray<FollowUp>(FOLLOW_UPS).map((followUp) => {
      const position = Y.createAbsolutePositionFromRelativePosition(
        Y.createRelativePositionFromJSON(followUp.after),
        doc,
      );
      const widget = new FollowUpWidget(followUp);
      return Decoration.widget({ widget, block: true, side: -1 }).range(
        Math.min(position?.index ?? length, length),
      );
    }),
    true,
  );
}

const showFollowUps = StateEffect.define<DecorationSet>();

// Shows the entry's follow-ups at their places in the text. They aren't part
// of the text, so the user can't select or edit them.
export function followUps(doc: Y.Doc) {
  const decorations = StateField.define<DecorationSet>({
    create: (state) => followUpDecorations(doc, state.doc.length),
    update: (value, transaction) => {
      for (const effect of transaction.effects) if (effect.is(showFollowUps)) return effect.value;
      return value.map(transaction.changes);
    },
    provide: (field) => EditorView.decorations.from(field),
  });

  // Each follow-up sits at the start of a line. Deleting the line break above
  // it would pull the user's next line up beside the line before. Only the
  // user's own edits are filtered: changes from Yjs have to apply as they are.
  const keepLineBreaks = EditorState.changeFilter.of((transaction) => {
    if (transaction.annotation(Transaction.userEvent) === undefined) return true;
    const ranges: Array<number> = [];
    for (let cursor = transaction.startState.field(decorations).iter(); cursor.value;) {
      if (cursor.from > 0) ranges.push(cursor.from - 1, cursor.from);
      cursor.next();
    }
    return ranges;
  });

  // When a follow-up arrives, moves the cursor below it so the user can answer.
  const watchFollowUps = ViewPlugin.define((view) => {
    const array = doc.getArray(FOLLOW_UPS);
    let destroyed = false;
    const observer = (event: Y.YArrayEvent<unknown>) => {
      const added = event.changes.added.size > 0;
      // The body changes from the same Yjs transaction reach the editor
      // through y-codemirror's own observer, which may run after this one.
      queueMicrotask(() => {
        if (destroyed) return;
        const end = view.state.doc.length;
        view.dispatch({
          effects: [
            showFollowUps.of(followUpDecorations(doc, end)),
            ...(added ? [EditorView.scrollIntoView(end, { y: "center" })] : []),
          ],
          selection: added ? { anchor: end } : undefined,
        });
        if (added) view.focus();
      });
    };
    array.observe(observer);
    return {
      destroy: () => {
        destroyed = true;
        array.unobserve(observer);
      },
    };
  });

  return [decorations, keepLineBreaks, watchFollowUps];
}
