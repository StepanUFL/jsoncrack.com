import React, { useMemo, useState } from "react";
import type { ModalProps } from "@mantine/core";
import { Modal, Stack, Text, ScrollArea, Flex, CloseButton, Button, Group, Textarea } from "@mantine/core";
import { CodeHighlight } from "@mantine/code-highlight";
import type { NodeData } from "../../../types/graph";
import useGraph from "../../editor/views/GraphView/stores/useGraph";
import useJson from "../../../store/useJson";
import useFile from "../../../store/useFile";
import { useEffect } from "react";
import { modify, applyEdits } from "jsonc-parser";

// return object from json removing array and object fields
const normalizeNodeData = (nodeRows: NodeData["text"]) => {
  if (!nodeRows || nodeRows.length === 0) return "{}";
  if (nodeRows.length === 1 && !nodeRows[0].key) return `${nodeRows[0].value}`;

  const obj = {};
  nodeRows?.forEach(row => {
    if (row.type !== "array" && row.type !== "object") {
      if (row.key) obj[row.key] = row.value;
    }
  });
  return JSON.stringify(obj, null, 2);
};

// return json path in the format $["customer"]
const jsonPathToString = (path?: NodeData["path"]) => {
  if (!path || path.length === 0) return "$";
  const segments = path.map(seg => (typeof seg === "number" ? seg : `"${seg}"`));
  return `$[${segments.join("][")}]`;
};

export const NodeModal = ({ opened, onClose }: ModalProps) => {
  const nodeData = useGraph(state => state.selectedNode);
  const getJson = useJson(state => state.getJson);
  const setJson = useJson(state => state.setJson);

  const [editing, setEditing] = useState(false);
  const [editedValue, setEditedValue] = useState("");
  const setContents = useFile(state => state.setContents);

  // initial content shown (readonly) when not editing
  const initialContent = useMemo(() => normalizeNodeData(nodeData?.text ?? []), [nodeData]);

  // when entering edit mode initialize textarea value
  const startEdit = () => {
    setEditedValue(initialContent);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditedValue("");
    setEditing(false);
  };

  const saveEdit = () => {
    if (!nodeData || !nodeData.path) {
      cancelEdit();
      return;
    }

    const original = getJson();
    let newValue: any = null;

    // try to parse edited value as JSON first
    try {
      newValue = JSON.parse(editedValue);
    } catch (err) {
      // fallback heuristics based on node type if parse fails
      const firstRow = nodeData.text && nodeData.text.length > 0 ? nodeData.text[0] : null;
      if (firstRow) {
        if (firstRow.type === "string") {
          newValue = editedValue;
        } else if (firstRow.type === "number") {
          const n = Number(editedValue);
          newValue = Number.isFinite(n) ? n : editedValue;
        } else if (firstRow.type === "boolean") {
          newValue = editedValue === "true";
        } else if (firstRow.type === "null") {
          newValue = null;
        } else {
          // default to raw string
          newValue = editedValue;
        }
      } else {
        newValue = editedValue;
      }
    }

    try {
      const edits = modify(original, nodeData.path as any, newValue, {
        formattingOptions: { insertSpaces: true, tabSize: 2 },
      });
      const newJson = applyEdits(original, edits);

      // Update both the left text editor contents and the central json store so
      // the change is reflected immediately in the editor and graph.
      try {
        // set Monaco/TextEditor contents immediately
        setContents({ contents: newJson, hasChanges: true, skipUpdate: true });
      } catch (e) {
        // ignore setContents failures
      }

      // update the canonical json state and graph
      setJson(newJson);
    } catch (err) {
      // If modify/apply fails, we silently cancel edit (could surface a toast)
      // eslint-disable-next-line no-console
      console.error("Failed to apply node edit:", err);
    }

    setEditing(false);
    onClose?.();
  };

  // Reset editing state when modal opens or when selected node changes so that
  // edited text doesn't leak to another node's edit session.
  useEffect(() => {
    setEditing(false);
    setEditedValue("");
  }, [nodeData?.id, opened]);

  return (
    <Modal size="auto" opened={opened} onClose={onClose} centered withCloseButton={false}>
      <Stack pb="sm" gap="sm">
        <Stack gap="xs">
          <Flex justify="space-between" align="center">
            <Text fz="xs" fw={500}>
              Content
            </Text>
            <CloseButton
              onClick={() => {
                if (editing) {
                  cancelEdit();
                }
                onClose?.();
              }}
            />
          </Flex>

          <ScrollArea.Autosize mah={250} maw={600}>
            {editing ? (
              <Textarea
                value={editedValue}
                onChange={e => setEditedValue(e.currentTarget.value)}
                minRows={6}
                maw={600}
                style={{ fontFamily: "monospace", whiteSpace: "pre" }}
              />
            ) : (
              <CodeHighlight
                code={initialContent}
                miw={350}
                maw={600}
                language="json"
                withCopyButton
              />
            )}
          </ScrollArea.Autosize>

          <Group justify="right">
            {!editing ? (
              <Button size="xs" variant="outline" onClick={startEdit}>
                Edit
              </Button>
            ) : (
              <>
                <Button size="xs" color="gray" variant="subtle" onClick={cancelEdit}>
                  Cancel
                </Button>
                <Button size="xs" onClick={saveEdit}>
                  Save
                </Button>
              </>
            )}
          </Group>
        </Stack>
        <Text fz="xs" fw={500}>
          JSON Path
        </Text>
        <ScrollArea.Autosize maw={600}>
          <CodeHighlight
            code={jsonPathToString(nodeData?.path)}
            miw={350}
            mah={250}
            language="json"
            copyLabel="Copy to clipboard"
            copiedLabel="Copied to clipboard"
            withCopyButton
          />
        </ScrollArea.Autosize>
      </Stack>
    </Modal>
  );
};
