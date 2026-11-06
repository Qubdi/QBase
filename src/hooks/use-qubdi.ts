import { qubdiContext } from '@/context/qubdi-context/qubdi-context';
import { useContext } from 'react';

export const useQubdi = () => useContext(qubdiContext);
