// app/page.tsx
'use client';

import { useState, useCallback } from 'react';
import { Upload, Package, DollarSign, Clock, Ruler, Download, Weight } from 'lucide-react';

// Base de datos de materiales
const MATERIALES = {
  'Aluminio 6061': { densidad: 2.70, costoKg: 85.00 },
  'Aluminio 7075': { densidad: 2.81, costoKg: 120.00 },
  'Acero 1018': { densidad: 7.87, costoKg: 25.00 },
  'Acero Inoxidable 304': { densidad: 8.00, costoKg: 95.00 },
  'Acero Inoxidable 316': { densidad: 8.00, costoKg: 115.00 },
  'Latón': { densidad: 8.50, costoKg: 180.00 },
  'Bronce': { densidad: 8.90, costoKg: 220.00 },
  'Cobre': { densidad: 8.96, costoKg: 250.00 },
  'Titanio Grade 5': { densidad: 4.43, costoKg: 850.00 },
  'Plástico ABS': { densidad: 1.05, costoKg: 45.00 },
  'Plástico Nylon': { densidad: 1.15, costoKg: 65.00 },
  'Plástico Delrin': { densidad: 1.41, costoKg: 95.00 }
};

interface Analysis {
  dimensions: { x: number; y: number; z: number };
  volume: number;
  surfaceArea: number;
  triangles: number;
  estimatedHours: number;
  weight: number;
}

interface Parameters {
  materialName: string;
  densidad: number;
  costoKg: number;
  machineHourRate: number;
  setupCost: number;
  finishingCostPerCm2: number;
  complexityFactor: number;
  profitMargin: number;
  quantity: number;
  estimatedHours: number;
  extraTime: number;
  externalMachiningCost: number;
  externalCostPerPiece: boolean;
}

export default function CNCQuoter() {
  const [fileName, setFileName] = useState<string>('');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);
  
  const [params, setParams] = useState<Parameters>({
    materialName: 'Aluminio 6061',
    densidad: 2.70,
    costoKg: 85.00,
    machineHourRate: 850,
    setupCost: 500,
    finishingCostPerCm2: 1.2,
    complexityFactor: 1.0,
    profitMargin: 30,
    quantity: 1,
    estimatedHours: 0,
    extraTime: 0,
    externalMachiningCost: 0,
    externalCostPerPiece: true
  });

  const parseSTLBinary = (arrayBuffer: ArrayBuffer) => {
    const dataView = new DataView(arrayBuffer);
    const triangles = dataView.getUint32(80, true);
    const vertices: number[] = [];
    
    for (let i = 0; i < triangles; i++) {
      const offset = 84 + i * 50;
      for (let v = 0; v < 3; v++) {
        const vOffset = offset + 12 + v * 12;
        vertices.push(
          dataView.getFloat32(vOffset, true),
          dataView.getFloat32(vOffset + 4, true),
          dataView.getFloat32(vOffset + 8, true)
        );
      }
    }
    
    return vertices;
  };

  const parseSTLASCII = (text: string) => {
    const vertices: number[] = [];
    const lines = text.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('vertex')) {
        const parts = trimmed.split(/\s+/);
        vertices.push(
          parseFloat(parts[1]),
          parseFloat(parts[2]),
          parseFloat(parts[3])
        );
      }
    }
    
    return vertices;
  };

  const analyzeModel = (vertices: number[]) => {
    if (vertices.length === 0) return null;

    // Calcular dimensiones
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    for (let i = 0; i < vertices.length; i += 3) {
      minX = Math.min(minX, vertices[i]);
      maxX = Math.max(maxX, vertices[i]);
      minY = Math.min(minY, vertices[i + 1]);
      maxY = Math.max(maxY, vertices[i + 1]);
      minZ = Math.min(minZ, vertices[i + 2]);
      maxZ = Math.max(maxZ, vertices[i + 2]);
    }

    const dimensions = {
      x: (maxX - minX) / 10,
      y: (maxY - minY) / 10,
      z: (maxZ - minZ) / 10
    };

    // Calcular volumen
    let volume = 0;
    for (let i = 0; i < vertices.length; i += 9) {
      const v1 = [vertices[i], vertices[i+1], vertices[i+2]];
      const v2 = [vertices[i+3], vertices[i+4], vertices[i+5]];
      const v3 = [vertices[i+6], vertices[i+7], vertices[i+8]];
      
      volume += Math.abs(
        v1[0] * (v2[1] * v3[2] - v2[2] * v3[1]) -
        v1[1] * (v2[0] * v3[2] - v2[2] * v3[0]) +
        v1[2] * (v2[0] * v3[1] - v2[1] * v3[0])
      ) / 6;
    }
    volume = Math.abs(volume) / 1000;

    // Calcular área superficial
    let surfaceArea = 0;
    for (let i = 0; i < vertices.length; i += 9) {
      const v1 = [vertices[i], vertices[i+1], vertices[i+2]];
      const v2 = [vertices[i+3], vertices[i+4], vertices[i+5]];
      const v3 = [vertices[i+6], vertices[i+7], vertices[i+8]];
      
      const a = [v2[0]-v1[0], v2[1]-v1[1], v2[2]-v1[2]];
      const b = [v3[0]-v1[0], v3[1]-v1[1], v3[2]-v1[2]];
      
      const cross = [
        a[1]*b[2] - a[2]*b[1],
        a[2]*b[0] - a[0]*b[2],
        a[0]*b[1] - a[1]*b[0]
      ];
      
      surfaceArea += Math.sqrt(cross[0]**2 + cross[1]**2 + cross[2]**2) / 2;
    }
    surfaceArea /= 100;

    const triangles = vertices.length / 9;
    const complexity = triangles / volume;
    const estimatedHours = (volume * 0.05 + surfaceArea * 0.02) * (1 + complexity / 10000);
    const weight = (volume * params.densidad) / 1000; // kg

    return {
      dimensions,
      volume,
      surfaceArea,
      triangles,
      estimatedHours,
      weight
    };
  };

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setLoading(true);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const isASCII = String.fromCharCode(...uint8Array.slice(0, 5)) === 'solid';
      
      let vertices: number[];
      if (isASCII) {
        const text = new TextDecoder().decode(arrayBuffer);
        vertices = parseSTLASCII(text);
      } else {
        vertices = parseSTLBinary(arrayBuffer);
      }

      const result = analyzeModel(vertices);
      if (result) {
        setAnalysis(result);
        setParams(prev => ({ ...prev, estimatedHours: result.estimatedHours }));
      }
    } catch (error) {
      alert('Error al procesar el archivo STL');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [params.densidad]);

  const calculateQuote = () => {
    if (!analysis) return null;

    const totalHours = (params.estimatedHours || analysis.estimatedHours) + params.extraTime;
    const materialCost = analysis.weight * params.costoKg * params.quantity;
    const machiningCost = totalHours * params.machineHourRate * params.complexityFactor * params.quantity;
    const finishingCost = analysis.surfaceArea * params.finishingCostPerCm2 * params.quantity;
    const setupCost = params.setupCost;
    
    const externalCost = params.externalCostPerPiece 
      ? params.externalMachiningCost * params.quantity 
      : params.externalMachiningCost;

    const subtotal = materialCost + machiningCost + finishingCost + setupCost + externalCost;
    const profit = subtotal * (params.profitMargin / 100);
    const total = subtotal + profit;

    return {
      materialCost,
      machiningCost,
      finishingCost,
      setupCost,
      externalCost,
      subtotal,
      profit,
      total,
      pricePerUnit: total / params.quantity,
      totalHours
    };
  };

  const quote = calculateQuote();

  const handleMaterialChange = (materialName: string) => {
    const material = MATERIALES[materialName as keyof typeof MATERIALES];
    if (material) {
      setParams(prev => ({
        ...prev,
        materialName,
        densidad: material.densidad,
        costoKg: material.costoKg
      }));
      
      // Recalcular peso si hay análisis
      if (analysis) {
        const newWeight = (analysis.volume * material.densidad) / 1000;
        setAnalysis(prev => prev ? { ...prev, weight: newWeight } : null);
      }
    }
  };

  const exportQuote = () => {
    if (!quote || !analysis) return;

    const data = {
      fecha: new Date().toLocaleDateString('es-MX'),
      archivo: fileName,
      material: params.materialName,
      analisis: {
        dimensiones: `${analysis.dimensions.x.toFixed(2)} × ${analysis.dimensions.y.toFixed(2)} × ${analysis.dimensions.z.toFixed(2)} cm`,
        volumen: `${analysis.volume.toFixed(2)} cm³`,
        peso: `${analysis.weight.toFixed(3)} kg`,
        superficie: `${analysis.surfaceArea.toFixed(2)} cm²`,
        tiempoEstimado: `${quote.totalHours.toFixed(2)} hrs`
      },
      cotizacion: {
        material: `$${quote.materialCost.toFixed(2)}`,
        maquinado: `$${quote.machiningCost.toFixed(2)}`,
        acabado: `$${quote.finishingCost.toFixed(2)}`,
        setup: `$${quote.setupCost.toFixed(2)}`,
        externos: `$${quote.externalCost.toFixed(2)}`,
        subtotal: `$${quote.subtotal.toFixed(2)}`,
        ganancia: `$${quote.profit.toFixed(2)}`,
        total: `$${quote.total.toFixed(2)}`,
        cantidad: params.quantity,
        precioPorUnidad: `$${quote.pricePerUnit.toFixed(2)}`
      }
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cotizacion-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl shadow-xl p-8 mb-6">
          <h1 className="text-4xl font-bold text-white mb-2">🔧 Cotizador CNC Pro</h1>
          <p className="text-blue-100">Análisis de modelos 3D con gestión de materiales</p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Panel izquierdo */}
          <div className="space-y-6">
            {/* Carga de archivo */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-2xl font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <Upload className="text-blue-600" />
                Cargar Archivo STL
              </h2>
              
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-blue-300 rounded-lg cursor-pointer hover:border-blue-500 transition-colors bg-blue-50">
                <div className="text-center">
                  <Upload className="mx-auto mb-2 text-blue-600" size={32} />
                  <span className="text-sm text-slate-600">
                    {fileName || 'Seleccionar archivo STL'}
                  </span>
                </div>
                <input 
                  type="file" 
                  accept=".stl"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </label>

              {loading && (
                <div className="mt-4 text-center">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  <p className="text-sm text-slate-600 mt-2">Analizando archivo...</p>
                </div>
              )}
            </div>

            {/* Análisis */}
            {analysis && (
              <div className="bg-white rounded-xl shadow-lg p-6">
                <h2 className="text-2xl font-semibold text-slate-800 mb-4 flex items-center gap-2">
                  <Package className="text-green-600" />
                  Análisis del Modelo
                </h2>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <Ruler size={16} className="text-blue-600" />
                      <span className="text-xs font-semibold text-slate-600">Dimensiones</span>
                    </div>
                    <p className="text-sm font-mono text-slate-800">
                      {analysis.dimensions.x.toFixed(2)} × {analysis.dimensions.y.toFixed(2)} × {analysis.dimensions.z.toFixed(2)} cm
                    </p>
                  </div>

                  <div className="bg-green-50 p-4 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <Package size={16} className="text-green-600" />
                      <span className="text-xs font-semibold text-slate-600">Volumen</span>
                    </div>
                    <p className="text-sm font-mono text-slate-800">{analysis.volume.toFixed(2)} cm³</p>
                  </div>

                  <div className="bg-yellow-50 p-4 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <Weight size={16} className="text-yellow-600" />
                      <span className="text-xs font-semibold text-slate-600">Peso</span>
                    </div>
                    <p className="text-sm font-mono text-slate-800">{analysis.weight.toFixed(3)} kg</p>
                  </div>

                  <div className="bg-purple-50 p-4 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <Clock size={16} className="text-purple-600" />
                      <span className="text-xs font-semibold text-slate-600">Tiempo Est.</span>
                    </div>
                    <p className="text-sm font-mono text-slate-800">{analysis.estimatedHours.toFixed(2)} hrs</p>
                  </div>

                  <div className="bg-pink-50 p-4 rounded-lg col-span-2">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-slate-600">Área Superficie</span>
                    </div>
                    <p className="text-sm font-mono text-slate-800">{analysis.surfaceArea.toFixed(2)} cm²</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Panel derecho - Parámetros */}
          <div className="space-y-6">
            {/* Material */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-semibold text-slate-800 mb-4">🔩 Material</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Material</label>
                  <select
                    value={params.materialName}
                    onChange={(e) => handleMaterialChange(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    {Object.keys(MATERIALES).map(name => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Densidad (g/cm³)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={params.densidad}
                      onChange={(e) => setParams({...params, densidad: parseFloat(e.target.value) || 0})}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Costo ($/kg)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={params.costoKg}
                      onChange={(e) => setParams({...params, costoKg: parseFloat(e.target.value) || 0})}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Tiempos */}
            <div className="bg-amber-50 rounded-xl shadow-lg p-6 border-2 border-amber-200">
              <h2 className="text-xl font-semibold text-slate-800 mb-4">⏱️ Tiempos de Trabajo</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Horas Estimadas</label>
                  <input
                    type="number"
                    step="0.1"
                    value={params.estimatedHours}
                    onChange={(e) => setParams({...params, estimatedHours: parseFloat(e.target.value) || 0})}
                    placeholder="Se calcula automáticamente"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Tiempo Extra (hrs)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={params.extraTime}
                    onChange={(e) => setParams({...params, extraTime: parseFloat(e.target.value) || 0})}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>
            </div>

            {/* Costos */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-semibold text-slate-800 mb-4">💰 Costos</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Tarifa Hora Máquina ($)</label>
                  <input
                    type="number"
                    value={params.machineHourRate}
                    onChange={(e) => setParams({...params, machineHourRate: parseFloat(e.target.value) || 0})}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Costo de Setup ($)</label>
                  <input
                    type="number"
                    value={params.setupCost}
                    onChange={(e) => setParams({...params, setupCost: parseFloat(e.target.value) || 0})}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Costo Acabado ($/cm²)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={params.finishingCostPerCm2}
                    onChange={(e) => setParams({...params, finishingCostPerCm2: parseFloat(e.target.value) || 0})}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Factor Complejidad</label>
                    <input
                      type="number"
                      step="0.1"
                      value={params.complexityFactor}
                      onChange={(e) => setParams({...params, complexityFactor: parseFloat(e.target.value) || 0})}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Margen (%)</label>
                    <input
                      type="number"
                      value={params.profitMargin}
                      onChange={(e) => setParams({...params, profitMargin: parseFloat(e.target.value) || 0})}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Cantidad de Piezas</label>
                  <input
                    type="number"
                    min="1"
                    value={params.quantity}
                    onChange={(e) => setParams({...params, quantity: parseInt(e.target.value) || 1})}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Maquinados Externos */}
            <div className="bg-pink-50 rounded-xl shadow-lg p-6 border-2 border-pink-200">
              <h2 className="text-xl font-semibold text-slate-800 mb-4">🏭 Maquinados Externos</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Costo Externo ($)</label>
                  <input
                    type="number"
                    value={params.externalMachiningCost}
                    onChange={(e) => setParams({...params, externalMachiningCost: parseFloat(e.target.value) || 0})}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-pink-500"
                  />
                </div>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={params.externalCostPerPiece}
                    onChange={(e) => setParams({...params, externalCostPerPiece: e.target.checked})}
                    className="w-4 h-4 text-pink-600 rounded focus:ring-pink-500"
                  />
                  <span className="text-sm text-slate-700">Costo por pieza (desmarcar para costo total)</span>
                </label>
              </div>
            </div>

            {/* Cotización */}
            {quote && (
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl shadow-lg p-6 border-2 border-green-300">
                <h2 className="text-2xl font-semibold text-green-800 mb-4 flex items-center gap-2">
                  <DollarSign className="text-green-600" />
                  Cotización Final
                </h2>
                
                <div className="space-y-2 mb-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-700">Material ({analysis?.weight.toFixed(3)} kg):</span>
                    <span className="font-semibold">${quote.materialCost.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-700">Maquinado ({quote.totalHours.toFixed(2)} hrs):</span>
                    <span className="font-semibold">${quote.machiningCost.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-700">Acabado:</span>
                    <span className="font-semibold">${quote.finishingCost.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-700">Setup:</span>
                    <span className="font-semibold">${quote.setupCost.toFixed(2)}</span>
                  </div>
                  {quote.externalCost > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-700">Externos:</span>
                      <span className="font-semibold">${quote.externalCost.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="border-t-2 border-green-300 my-2"></div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-700">Subtotal:</span>
                    <span className="font-semibold">${quote.subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-700">Ganancia ({params.profitMargin}%):</span>
                    <span className="font-semibold">${quote.profit.toFixed(2)}</span>
                  </div>
                </div>

                <div className="border-t-2 border-green-400 pt-3 mb-4">
                  <div className="flex justify-between items-center">
                    <span className="text-xl font-bold text-green-800">TOTAL:</span>
                    <span className="text-3xl font-bold text-green-700">${quote.total.toFixed(2)}</span>
                  </div>
                  {params.quantity > 1 && (
                    <div className="flex justify-between items-center mt-2">
                      <span className="text-sm text-slate-600">Precio por unidad:</span>
                      <span className="text-lg font-semibold text-green-700">${quote.pricePerUnit.toFixed(2)}</span>
                    </div>
                  )}
                </div>

                <button 
                  onClick={exportQuote}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
                >
                  <Download size={20} />
                  Exportar Cotización
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}