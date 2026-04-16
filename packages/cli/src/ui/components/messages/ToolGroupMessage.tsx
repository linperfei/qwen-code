/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useMemo } from 'react';
import { Box } from 'ink';
import type { IndividualToolCallDisplay } from '../../types.js';
import { ToolCallStatus } from '../../types.js';
import { ToolMessage } from './ToolMessage.js';
import { ToolConfirmationMessage } from './ToolConfirmationMessage.js';
import { CompactToolGroupDisplay } from './CompactToolGroupDisplay.js';
import { theme } from '../../semantic-colors.js';
import { SHELL_COMMAND_NAME, SHELL_NAME } from '../../constants.js';
import { useConfig } from '../../contexts/ConfigContext.js';
import { useCompactMode } from '../../contexts/CompactModeContext.js';
import type { AgentResultDisplay } from '@qwen-code/qwen-code-core';

function isAgentWithPendingConfirmation(
  rd: IndividualToolCallDisplay['resultDisplay'],
): rd is AgentResultDisplay {
  return (
    typeof rd === 'object' &&
    rd !== null &&
    'type' in rd &&
    (rd as AgentResultDisplay).type === 'task_execution' &&
    (rd as AgentResultDisplay).pendingConfirmation !== undefined
  );
}

interface ToolGroupMessageProps {
  groupId: number;
  toolCalls: IndividualToolCallDisplay[];
  availableTerminalHeight?: number;
  contentWidth: number;
  isFocused?: boolean;
  activeShellPtyId?: number | null;
  embeddedShellFocused?: boolean;
  onShellInputSubmit?: (input: string) => void;
  isUserInitiated?: boolean;
}

// Main component renders the border and maps the tools using ToolMessage
export const ToolGroupMessage: React.FC<ToolGroupMessageProps> = ({
  toolCalls,
  availableTerminalHeight,
  contentWidth,
  isFocused = true,
  activeShellPtyId,
  embeddedShellFocused,
  isUserInitiated,
}) => {
  const config = useConfig();
  const { compactMode } = useCompactMode();

  const hasConfirmingTool = toolCalls.some(
    (t) => t.status === ToolCallStatus.Confirming,
  );
  const hasErrorTool = toolCalls.some((t) => t.status === ToolCallStatus.Error);
  const isEmbeddedShellFocused =
    embeddedShellFocused &&
    toolCalls.some(
      (t) =>
        t.ptyId === activeShellPtyId && t.status === ToolCallStatus.Executing,
    );

  // useMemo must be called unconditionally (Rules of Hooks) — before any early return
  // only prompt for tool approval on the first 'confirming' tool in the list
  const toolAwaitingApproval = useMemo(
    () => toolCalls.find((tc) => tc.status === ToolCallStatus.Confirming),
    [toolCalls],
  );

  // Determine which subagent tools currently have a pending confirmation.
  // Must be called unconditionally (Rules of Hooks) — before any early return.
  const subagentsAwaitingApproval = useMemo(
    () =>
      toolCalls.filter((tc) =>
        isAgentWithPendingConfirmation(tc.resultDisplay),
      ),
    [toolCalls],
  );

  // Compact mode: entire group → single line summary
  // Force-expand when: user must interact (Confirming or subagent pending
  // confirmation), tool errored, shell is focused, or user-initiated
  const hasSubagentPendingConfirmation = subagentsAwaitingApproval.length > 0;
  const showCompact =
    compactMode &&
    !hasConfirmingTool &&
    !hasSubagentPendingConfirmation &&
    !hasErrorTool &&
    !isEmbeddedShellFocused &&
    !isUserInitiated;

  if (showCompact) {
    return (
      <CompactToolGroupDisplay
        toolCalls={toolCalls}
        contentWidth={contentWidth}
      />
    );
  }

  // Full expanded view
  const hasPending = !toolCalls.every(
    (t) => t.status === ToolCallStatus.Success,
  );
  const isShellCommand = toolCalls.some(
    (t) => t.name === SHELL_COMMAND_NAME || t.name === SHELL_NAME,
  );
  const borderColor =
    isShellCommand || isEmbeddedShellFocused
      ? theme.ui.symbol
      : hasPending
        ? theme.status.warning
        : theme.border.default;

  const staticHeight = /* border */ 2 + /* marginBottom */ 1;
  // account for border (2 chars) and padding (2 chars)
  const innerWidth = contentWidth - 4;

  let countToolCallsWithResults = 0;
  for (const tool of toolCalls) {
    if (tool.resultDisplay !== undefined && tool.resultDisplay !== '') {
      countToolCallsWithResults++;
    }
  }
  const countOneLineToolCalls = toolCalls.length - countToolCallsWithResults;
  const availableTerminalHeightPerToolMessage = availableTerminalHeight
    ? Math.max(
        Math.floor(
          (availableTerminalHeight - staticHeight - countOneLineToolCalls) /
            Math.max(1, countToolCallsWithResults),
        ),
        1,
      )
    : undefined;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      /*
        This width constraint is highly important and protects us from an Ink rendering bug.
        Since the ToolGroup can typically change rendering states frequently, it can cause
        Ink to render the border of the box incorrectly and span multiple lines and even
        cause tearing.
      */
      width={contentWidth}
      borderDimColor={
        hasPending && (!isShellCommand || !isEmbeddedShellFocused)
      }
      borderColor={borderColor}
      gap={1}
    >
      {toolCalls.map((tool) => {
        const isConfirming = toolAwaitingApproval?.callId === tool.callId;
        return (
          <Box key={tool.callId} flexDirection="column" minHeight={1}>
            <Box flexDirection="row" alignItems="center">
              <ToolMessage
                {...tool}
                availableTerminalHeight={availableTerminalHeightPerToolMessage}
                contentWidth={innerWidth}
                emphasis={
                  isConfirming
                    ? 'high'
                    : toolAwaitingApproval
                      ? 'low'
                      : 'medium'
                }
                activeShellPtyId={activeShellPtyId}
                embeddedShellFocused={embeddedShellFocused}
                config={config}
                forceShowResult={
                  isUserInitiated ||
                  tool.status === ToolCallStatus.Confirming ||
                  tool.status === ToolCallStatus.Error ||
                  isAgentWithPendingConfirmation(tool.resultDisplay)
                }
              />
            </Box>
            {tool.status === ToolCallStatus.Confirming &&
              isConfirming &&
              tool.confirmationDetails && (
                <ToolConfirmationMessage
                  confirmationDetails={tool.confirmationDetails}
                  config={config}
                  isFocused={isFocused}
                  availableTerminalHeight={
                    availableTerminalHeightPerToolMessage
                  }
                  contentWidth={innerWidth}
                />
              )}
          </Box>
        );
      })}
    </Box>
  );
};
