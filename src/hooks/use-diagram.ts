import { diagramContext } from '@/context/diagram-context/diagram-context';
import { useContext } from 'react';

export const useDiagram = () => useContext(diagramContext);
