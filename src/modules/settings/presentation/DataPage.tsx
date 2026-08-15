import { Database, Download, FileJson, RefreshCw, ShieldCheck, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { useFinance } from '../../../app/providers/FinanceProvider';
import { Card, SectionHeader } from '../../../shared/components/Card';
import { ConfirmDialog } from '../../../shared/components/Modal';

export function DataPage() {
  const { database, selectedMonth, exportJson, importJson, resetDemo } = useFinance();
  const inputRef = useRef<HTMLInputElement>(null); const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null); const [resetOpen, setResetOpen] = useState(false);
  const download = (scope: 'month' | 'year' | 'all') => {
    const blob = new Blob([exportJson(scope)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `titus-finance-${scope}-${selectedMonth}.json`; link.click(); URL.revokeObjectURL(url); setMessage({ type: 'success', text: 'Exportación lista. Guardala en un lugar seguro.' });
  };
  const importFile = async (file?: File) => { if (!file) return; try { importJson(await file.text()); setMessage({ type: 'success', text: 'Datos importados correctamente.' }); } catch (error) { setMessage({ type: 'error', text: error instanceof Error ? error.message : 'No pudimos importar el archivo.' }); } finally { if (inputRef.current) inputRef.current.value = ''; } };
  return <>
    <div className="page-heading"><div><p className="eyebrow">CONTROL LOCAL</p><h1>Datos y preferencias</h1><p>Tus datos viven en este navegador y están bajo tu control.</p></div></div>
    {message && <div className={`toast-message toast-message--${message.type}`} role="status">{message.text}<button aria-label="Cerrar mensaje" onClick={() => setMessage(null)}>×</button></div>}
    <div className="settings-grid"><Card><SectionHeader title="Exportar información" /><p className="muted">Descargá un respaldo JSON compatible con Titu's Finance.</p><div className="data-actions"><button className="data-option" onClick={() => download('month')}><span><FileJson /></span><div><strong>Mes actual</strong><small>{selectedMonth} · {database.months[selectedMonth]?.transactions.length ?? 0} movimientos</small></div><Download size={18} /></button><button className="data-option" onClick={() => download('year')}><span><Database /></span><div><strong>Año seleccionado</strong><small>Todos los snapshots de {selectedMonth.slice(0, 4)}</small></div><Download size={18} /></button><button className="data-option" onClick={() => download('all')}><span><ShieldCheck /></span><div><strong>Copia completa</strong><small>Meses, reglas, categorías y objetivos</small></div><Download size={18} /></button></div></Card>
      <Card><SectionHeader title="Importar y restaurar" /><p className="muted">Validamos la estructura antes de guardar. Podés importar un mes o una copia completa.</p><input ref={inputRef} type="file" accept="application/json,.json" className="sr-only" onChange={(event) => importFile(event.target.files?.[0])} /><button className="import-zone" onClick={() => inputRef.current?.click()}><Upload size={30} /><strong>Seleccionar archivo JSON</strong><small>El archivo actual se conserva si importás solamente un mes</small></button></Card>
      <Card className="danger-zone"><SectionHeader title="Datos de demostración" /><p className="muted">Restaurá el ejemplo original de agosto 2026. Esto reemplaza todos los cambios locales.</p><button className="button button--danger-soft" onClick={() => setResetOpen(true)}><RefreshCw size={17} /> Restablecer datos demo</button></Card>
      <Card className="privacy-card"><ShieldCheck size={26} /><div><h2>Privacidad por diseño</h2><p>La aplicación no envía información a servidores. La preferencia para ocultar importes también se guarda localmente.</p></div></Card></div>
    <ConfirmDialog open={resetOpen} title="¿Restablecer la demo?" message="Se reemplazarán tus datos actuales por la información de ejemplo. Exportá una copia antes si querés conservarlos." onClose={() => setResetOpen(false)} onConfirm={() => { resetDemo(); setMessage({ type: 'success', text: 'Datos demo restaurados.' }); }} />
  </>;
}
