import { CheckCircle2, Download, Ellipsis, Share, Smartphone } from 'lucide-react';
import { useId, useState } from 'react';
import { usePwaInstall } from '../../../app/providers/PwaInstallProvider';
import { Card, SectionHeader } from '../../../shared/components/Card';

function isAppleMobile() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
}

export function InstallAppCard() {
  const { status, canPrompt, promptInstall } = usePwaInstall();
  const [guideOpen, setGuideOpen] = useState(false);
  const guideId = useId();
  const appleMobile = isAppleMobile();
  const showGuide = guideOpen || status === 'error' || status === 'accepted';
  const install = () => {
    if (canPrompt) void promptInstall();
    else setGuideOpen(true);
  };

  return <Card className="install-card">
    <SectionHeader title="La app en tu dispositivo" action={<Smartphone size={22} aria-hidden="true" />} />
    {status === 'installed' ? <p className="install-status" role="status"><CheckCircle2 size={20} aria-hidden="true" /> Finance App ya está instalada.</p> : <>
      <p className="muted">Accedé a tus finanzas desde el ícono en tu pantalla de inicio.</p>
      <div className="install-actions">
        <button type="button" className="button button--primary" disabled={status === 'prompting'} onClick={install}
          aria-expanded={showGuide} aria-controls={guideId}>
          <Download size={18} aria-hidden="true" /> {status === 'prompting' ? 'Esperando al navegador…' : 'Instalar Finance App'}
        </button>
        {(canPrompt || status === 'prompting') && <button type="button" className="text-button" onClick={() => setGuideOpen(true)}>Ver instrucciones</button>}
      </div>
      {status === 'accepted' && <p className="install-notice" role="status">Confirmaste la instalación. Cuando el navegador termine, buscá el ícono de Finance. Si no aparece, seguí estos pasos.</p>}
      {status === 'dismissed' && <p className="install-notice" role="status">Cancelaste la instalación. Podés volver a intentarlo desde el menú del navegador.</p>}
      {status === 'error' && <p className="install-notice" role="status">No pudimos abrir la instalación. Podés completarla desde el menú del navegador.</p>}
      <div id={guideId} className="install-guide" hidden={!showGuide}>
        {appleMobile ? <>
          <h3>Instalar en iPhone o iPad</h3>
          <p>En iPhone y iPad, la instalación se completa desde Safari:</p>
          <ol>
            <li><strong>Abrí esta página en Safari.</strong> Si llegaste desde WhatsApp u otra app, copiá el enlace y pegalo en Safari.</li>
            <li><strong>Tocá Compartir.</strong> Buscá este ícono en la barra de Safari: <span className="install-share-icon"><Share size={26} aria-hidden="true" /><span>Compartir</span></span> Es un cuadrado con una flecha hacia arriba. Si no lo ves, abrí el menú de Safari <Ellipsis size={19} className="install-inline-icon" aria-label="tres puntos" /> y elegí <strong>Compartir</strong>.</li>
            <li>Elegí <strong>Agregar a Inicio</strong> o <strong>Añadir a pantalla de inicio</strong>. Si no aparece, buscá esa opción en <strong>Editar acciones</strong>.</li>
            <li>Activá <strong>Abrir como app web</strong>, si aparece, y tocá <strong>Agregar</strong>.</li>
          </ol>
          <p>Después, abrí Finance desde el nuevo ícono en tu pantalla de inicio.</p>
        </> : <>
          <h3>Instalar desde el navegador</h3>
          <ol>
            <li>Abrí el menú del navegador.</li>
            <li>Elegí <strong>Instalar aplicación</strong> o <strong>Añadir a pantalla de inicio</strong>. En Samsung Internet puede aparecer en <strong>Añadir página a → Pantalla de inicio</strong>.</li>
            <li>Confirmá la instalación y buscá el ícono de Finance en tu dispositivo.</li>
          </ol>
          <p>Si estás dentro de otra app, abrí el enlace en Safari, Chrome, Edge o Samsung Internet para ver sus opciones de instalación.</p>
          <p>En Safari para Mac, usá <strong>Archivo → Añadir al Dock</strong>.</p>
        </>}
      </div>
    </>}
  </Card>;
}
