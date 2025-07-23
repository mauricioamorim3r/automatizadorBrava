import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Stage, Layer, Rect, Text, Circle, Line, Group } from 'react-konva';
import { Box, Paper, Toolbar, IconButton, Typography } from '@mui/material';
import { Add, Delete, PlayArrow, Save, Undo, Redo } from '@mui/icons-material';
import Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';

export interface Position {
  x: number;
  y: number;
}

export interface StepNode {
  id: string;
  type: string;
  name: string;
  position: Position;
  config: unknown;
  connections: Connection[];
}

export interface Connection {
  id: string;
  sourceId: string;
  targetId: string;
  sourcePort?: string;
  targetPort?: string;
}

interface CanvasEditorProps {
  steps: StepNode[];
  onStepsChange: (steps: StepNode[]) => void;
  onSave: () => void;
  onExecute: () => void;
  selectedStepId?: string;
  onStepSelect?: (stepId: string | null) => void;
  isReadOnly?: boolean;
}

const STEP_TYPES: Record<string, { color: string; label: string; icon: string }> = {
  SOURCE_MANUAL_INPUT: { 
    color: '#4CAF50', 
    label: 'Manual Input',
    icon: '📝'
  },
  SOURCE_FILE: {
    color: '#4CAF50',
    label: 'File Input',
    icon: '📄'
  },
  SOURCE_API: {
    color: '#4CAF50',
    label: 'API Input',
    icon: '🌐'
  },
  FILTER_SIMPLE: { 
    color: '#2196F3', 
    label: 'Simple Filter',
    icon: '🔍'
  },
  FILTER_ADVANCED: {
    color: '#2196F3',
    label: 'Advanced Filter',
    icon: '🔬'
  },
  ACTION_TRANSFORM: { 
    color: '#FF9800', 
    label: 'Transform',
    icon: '⚙️'
  },
  ACTION_BROWSER: {
    color: '#FF9800',
    label: 'Browser Action',
    icon: '🌐'
  },
  DESTINATION_FILE: { 
    color: '#9C27B0', 
    label: 'Save File',
    icon: '💾'
  },
  DESTINATION_EMAIL: {
    color: '#9C27B0',
    label: 'Send Email',
    icon: '📧'
  }
};

const STEP_WIDTH = 120;
const STEP_HEIGHT = 80;
const PORT_RADIUS = 8;

export const CanvasEditor: React.FC<CanvasEditorProps> = ({
  steps,
  onStepsChange,
  onSave,
  onExecute,
  selectedStepId,
  onStepSelect,
  isReadOnly = false
}) => {
  const stageRef = useRef<Konva.Stage>(null);
  const [selectedStep, setSelectedStep] = useState<string | null>(selectedStepId || null);
  const [draggedStep, setDraggedStep] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionStart, setConnectionStart] = useState<{ stepId: string; port: string } | null>(null);
  const [tempConnection, setTempConnection] = useState<Position | null>(null);
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 });
  const [history, setHistory] = useState<StepNode[][]>([steps]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // Sync external selection with internal state
  useEffect(() => {
    setSelectedStep(selectedStepId || null);
  }, [selectedStepId]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      const container = stageRef.current?.container();
      if (container) {
        const containerRect = container.getBoundingClientRect();
        setStageSize({
          width: containerRect.width,
          height: containerRect.height
        });
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // History management
  const addToHistory = useCallback((newSteps: StepNode[]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push([...newSteps]);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [history, historyIndex]);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const prevSteps = history[historyIndex - 1];
      setHistoryIndex(historyIndex - 1);
      onStepsChange(prevSteps);
    }
  }, [history, historyIndex, onStepsChange]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const nextSteps = history[historyIndex + 1];
      setHistoryIndex(historyIndex + 1);
      onStepsChange(nextSteps);
    }
  }, [history, historyIndex, onStepsChange]);

  // Add new step
  const addStep = useCallback((stepType: string) => {
    if (isReadOnly) return;

    const newStep: StepNode = {
      id: `step_${Date.now()}`,
      type: stepType,
      name: `${STEP_TYPES[stepType]?.label || 'Step'} ${steps.length + 1}`,
      position: { x: 100, y: 100 + steps.length * 120 },
      config: {},
      connections: []
    };

    const newSteps = [...steps, newStep];
    onStepsChange(newSteps);
    addToHistory(newSteps);
  }, [steps, onStepsChange, addToHistory, isReadOnly]);

  // Delete step
  const deleteStep = useCallback((stepId: string) => {
    if (isReadOnly) return;

    const newSteps = steps
      .filter(step => step.id !== stepId)
      .map(step => ({
        ...step,
        connections: step.connections.filter(conn => conn.targetId !== stepId)
      }));

    onStepsChange(newSteps);
    addToHistory(newSteps);
    setSelectedStep(null);
  }, [steps, onStepsChange, addToHistory, isReadOnly]);

  // Update step position
  const updateStepPosition = useCallback((stepId: string, position: Position) => {
    if (isReadOnly) return;

    const newSteps = steps.map(step =>
      step.id === stepId ? { ...step, position } : step
    );
    onStepsChange(newSteps);
  }, [steps, onStepsChange, isReadOnly]);

  // Handle step drag
  const handleStepDragMove = useCallback((e: KonvaEventObject<DragEvent>, stepId: string) => {
    if (isReadOnly) return;

    const newPosition = { x: e.target.x(), y: e.target.y() };
    updateStepPosition(stepId, newPosition);
  }, [updateStepPosition, isReadOnly]);

  // Handle step drag end
  const handleStepDragEnd = useCallback(() => {
    if (isReadOnly) return;

    addToHistory(steps);
    setDraggedStep(null);
  }, [steps, addToHistory, isReadOnly]);

  // Handle connection start
  const handleConnectionStart = useCallback((stepId: string, port: string) => {
    if (isReadOnly) return;

    setIsConnecting(true);
    setConnectionStart({ stepId, port });
  }, [isReadOnly]);

  // Handle connection end
  const handleConnectionEnd = useCallback((targetStepId: string, targetPort: string) => {
    if (isReadOnly || !connectionStart || connectionStart.stepId === targetStepId) {
      setIsConnecting(false);
      setConnectionStart(null);
      setTempConnection(null);
      return;
    }

    // Create new connection
    const newConnection: Connection = {
      id: `conn_${Date.now()}`,
      sourceId: connectionStart.stepId,
      targetId: targetStepId,
      sourcePort: connectionStart.port,
      targetPort: targetPort
    };

    const newSteps = steps.map(step => {
      if (step.id === connectionStart.stepId) {
        // Remove existing connections from the same port
        const filteredConnections = step.connections.filter(
          conn => conn.sourcePort !== connectionStart.port
        );
        return {
          ...step,
          connections: [...filteredConnections, newConnection]
        };
      }
      return step;
    });

    onStepsChange(newSteps);
    addToHistory(newSteps);

    setIsConnecting(false);
    setConnectionStart(null);
    setTempConnection(null);
  }, [connectionStart, steps, onStepsChange, addToHistory, isReadOnly]);

  // Handle stage mouse move for temporary connection line
  const handleStageMouseMove = useCallback((e: KonvaEventObject<MouseEvent>) => {
    if (isConnecting && connectionStart) {
      const stage = e.target.getStage();
      if (stage) {
        const pos = stage.getPointerPosition();
        if (pos) {
          setTempConnection(pos);
        }
      }
    }
  }, [isConnecting, connectionStart]);

  // Handle stage click to cancel connection
  const handleStageClick = useCallback((e: KonvaEventObject<MouseEvent>) => {
    // If clicking on empty stage, deselect step and cancel connection
    if (e.target === e.target.getStage()) {
      setSelectedStep(null);
      onStepSelect?.(null);
      if (isConnecting) {
        setIsConnecting(false);
        setConnectionStart(null);
        setTempConnection(null);
      }
    }
  }, [isConnecting]);

  // Render step node
  const renderStep = useCallback((step: StepNode) => {
    const stepType = STEP_TYPES[step.type] || { color: '#757575', label: 'Unknown', icon: '❓' };
    const isSelected = selectedStep === step.id;
    const isDragged = draggedStep === step.id;

    return (
      <Group
        key={step.id}
        x={step.position.x}
        y={step.position.y}
        draggable={!isReadOnly}
        onDragStart={() => setDraggedStep(step.id)}
        onDragMove={(e) => handleStepDragMove(e, step.id)}
        onDragEnd={() => handleStepDragEnd()}
        onClick={() => {
          setSelectedStep(step.id);
          onStepSelect?.(step.id);
        }}
      >
        {/* Step background */}
        <Rect
          width={STEP_WIDTH}
          height={STEP_HEIGHT}
          fill={stepType.color}
          stroke={isSelected ? '#000' : stepType.color}
          strokeWidth={isSelected ? 2 : 0}
          cornerRadius={8}
          shadowBlur={isDragged ? 10 : 5}
          shadowOffsetY={isDragged ? 5 : 2}
          shadowOpacity={0.3}
        />

        {/* Step icon */}
        <Text
          x={10}
          y={15}
          text={stepType.icon}
          fontSize={20}
          fontFamily="Arial"
        />

        {/* Step label */}
        <Text
          x={35}
          y={20}
          text={step.name}
          fontSize={12}
          fontFamily="Arial"
          fill="white"
          fontStyle="bold"
          width={STEP_WIDTH - 45}
          ellipsis={true}
        />

        {/* Step type */}
        <Text
          x={10}
          y={45}
          text={stepType.label}
          fontSize={10}
          fontFamily="Arial"
          fill="rgba(255,255,255,0.8)"
          width={STEP_WIDTH - 20}
          ellipsis={true}
        />

        {/* Input port */}
        <Circle
          x={0}
          y={STEP_HEIGHT / 2}
          radius={PORT_RADIUS}
          fill="#fff"
          stroke={stepType.color}
          strokeWidth={2}
          onClick={() => handleConnectionEnd(step.id, 'input')}
        />

        {/* Output port */}
        <Circle
          x={STEP_WIDTH}
          y={STEP_HEIGHT / 2}
          radius={PORT_RADIUS}
          fill="#fff"
          stroke={stepType.color}
          strokeWidth={2}
          onClick={() => handleConnectionStart(step.id, 'output')}
        />
      </Group>
    );
  }, [selectedStep, draggedStep, handleStepDragMove, handleStepDragEnd, 
      handleConnectionStart, handleConnectionEnd, isReadOnly]);

  // Render connections
  const renderConnections = useCallback(() => {
    const connections: React.ReactElement[] = [];

    steps.forEach(step => {
      step.connections.forEach(conn => {
        const targetStep = steps.find(s => s.id === conn.targetId);
        if (!targetStep) return;

        const startX = step.position.x + STEP_WIDTH;
        const startY = step.position.y + STEP_HEIGHT / 2;
        const endX = targetStep.position.x;
        const endY = targetStep.position.y + STEP_HEIGHT / 2;

        // Calculate control points for curved line
        const midX = startX + (endX - startX) / 2;
        const points = [startX, startY, midX, startY, midX, endY, endX, endY];

        connections.push(
          <Line
            key={conn.id}
            points={points}
            stroke="#666"
            strokeWidth={2}
            tension={0.5}
            bezier={true}
          />
        );
      });
    });

    return connections;
  }, [steps]);

  // Render temporary connection
  const renderTempConnection = useCallback(() => {
    if (!isConnecting || !connectionStart || !tempConnection) return null;

    const sourceStep = steps.find(s => s.id === connectionStart.stepId);
    if (!sourceStep) return null;

    const startX = sourceStep.position.x + STEP_WIDTH;
    const startY = sourceStep.position.y + STEP_HEIGHT / 2;
    const endX = tempConnection.x;
    const endY = tempConnection.y;

    return (
      <Line
        points={[startX, startY, endX, endY]}
        stroke="#666"
        strokeWidth={2}
        dash={[5, 5]}
      />
    );
  }, [isConnecting, connectionStart, tempConnection, steps]);

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar */}
      <Paper elevation={1}>
        <Toolbar variant="dense">
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            Workflow Canvas
          </Typography>
          
          {!isReadOnly && (
            <>
              <IconButton onClick={() => addStep('SOURCE_MANUAL_INPUT')} title="Add Manual Input">
                📝
              </IconButton>
              
              <IconButton onClick={() => addStep('SOURCE_FILE')} title="Add File Input">
                📄
              </IconButton>
              
              <IconButton onClick={() => addStep('SOURCE_API')} title="Add API Input">
                🌐
              </IconButton>
              
              <IconButton onClick={() => addStep('FILTER_SIMPLE')} title="Add Simple Filter">
                🔍
              </IconButton>
              
              <IconButton onClick={() => addStep('ACTION_TRANSFORM')} title="Add Transform">
                ⚙️
              </IconButton>
              
              <IconButton onClick={() => addStep('ACTION_BROWSER')} title="Add Browser Action">
                🌍
              </IconButton>
              
              <IconButton onClick={() => addStep('DESTINATION_FILE')} title="Add File Output">
                💾
              </IconButton>
              
              <IconButton onClick={() => addStep('DESTINATION_EMAIL')} title="Add Email Output">
                📧
              </IconButton>
              
              <IconButton 
                onClick={undo} 
                disabled={historyIndex <= 0}
                title="Undo"
              >
                <Undo />
              </IconButton>
              
              <IconButton 
                onClick={redo} 
                disabled={historyIndex >= history.length - 1}
                title="Redo"
              >
                <Redo />
              </IconButton>
            </>
          )}
          
          <IconButton onClick={onSave} title="Save">
            <Save />
          </IconButton>
          
          <IconButton onClick={onExecute} title="Execute">
            <PlayArrow />
          </IconButton>
          
          {selectedStep && !isReadOnly && (
            <IconButton 
              onClick={() => deleteStep(selectedStep)} 
              title="Delete Selected"
              color="error"
            >
              <Delete />
            </IconButton>
          )}
        </Toolbar>
      </Paper>

      {/* Canvas */}
      <Box sx={{ flexGrow: 1, position: 'relative' }}>
        <Stage
          ref={stageRef}
          width={stageSize.width}
          height={stageSize.height}
          onMouseMove={handleStageMouseMove}
          onClick={handleStageClick}
        >
          <Layer>
            {/* Grid background */}
            {Array.from({ length: Math.ceil(stageSize.width / 50) }, (_, i) => (
              <Line
                key={`v-${i}`}
                points={[i * 50, 0, i * 50, stageSize.height]}
                stroke="rgba(0,0,0,0.1)"
                strokeWidth={1}
              />
            ))}
            {Array.from({ length: Math.ceil(stageSize.height / 50) }, (_, i) => (
              <Line
                key={`h-${i}`}
                points={[0, i * 50, stageSize.width, i * 50]}
                stroke="rgba(0,0,0,0.1)"
                strokeWidth={1}
              />
            ))}

            {/* Connections */}
            {renderConnections()}
            
            {/* Temporary connection */}
            {renderTempConnection()}

            {/* Steps */}
            {steps.map(renderStep)}
          </Layer>
        </Stage>
      </Box>
    </Box>
  );
};