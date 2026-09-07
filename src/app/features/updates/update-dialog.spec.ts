// features/updates/update-dialog.spec.ts
// B5 AC: con las signals del checker en cada estado, el componente renderiza la
// vista correcta; "Actualizar ahora" llama al bridge; "Más tarde" llama
// dismissUpdate(). Corre con el builder de Angular (ng test) — como los demás
// specs de componentes del repo (initTestEnvironment + templateUrl del builder).
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { UpdateDialog } from './update-dialog';
import { UpdateCheckerService } from '../../core/services/updates/update-checker.service';
import type { UpdateInfo } from '../../core/services/updates/github-releases.service';
import type { CheckState, DownloadState } from '../../core/services/updates/update-checker.service';

const INFO: UpdateInfo = {
  version: '1.0.1',
  url: 'https://github.com/Mudo0/album-app/releases/download/v1.0.1/album-app.apk',
  fileName: 'album-app.apk',
  notes: 'Notas de la versión',
};

interface Harness {
  available: ReturnType<typeof signal<boolean>>;
  info: ReturnType<typeof signal<UpdateInfo | null>>;
  download: ReturnType<typeof signal<DownloadState>>;
  checker: UpdateCheckerService;
}

function setup(download: DownloadState = { type: 'idle' }, available = true): Harness {
  const availableSig = signal(available);
  const infoSig = signal<UpdateInfo | null>(INFO);
  const downloadSig = signal<DownloadState>(download);

  const checker = {
    available: availableSig,
    info: infoSig,
    download: downloadSig,
    startDownload: vi.fn().mockResolvedValue(undefined),
    dismissUpdate: vi.fn(),
    installReady: vi.fn().mockResolvedValue(undefined),
  } as unknown as UpdateCheckerService;

  TestBed.configureTestingModule({
    imports: [UpdateDialog],
    providers: [{ provide: UpdateCheckerService, useValue: checker }],
  });

  return { available: availableSig, info: infoSig, download: downloadSig, checker };
}

function render(download: DownloadState = { type: 'idle' }, available = true) {
  const h = setup(download, available);
  const fixture = TestBed.createComponent(UpdateDialog);
  fixture.detectChanges();
  return { ...h, fixture, el: fixture.nativeElement as HTMLElement };
}

function click(button: HTMLElement | null): void {
  expect(button).toBeTruthy();
  button?.dispatchEvent(new MouseEvent('click'));
}

describe('UpdateDialog', () => {
  it('no renderiza nada cuando no hay update disponible', () => {
    const { el } = render({ type: 'idle' }, false);
    expect(el.textContent).toBe('');
  });

  it('sin update no se monta el overlay (regresión: el host NO puede tapar la app)', () => {
    // BUG 2026-09: el overlay (fixed+backdrop) estaba en :host, que se monta
    // SIEMPRE en app.html → tapaba la app en gris y bloqueaba clicks sin update.
    // El overlay debe vivir en .update-overlay (condicionado por @if).
    const { el } = render({ type: 'idle' }, false);
    expect(el.querySelector('.update-overlay')).toBeNull();
    expect(el.querySelector('.update-card')).toBeNull();
  });

  it('estado idle → vista "Nueva versión": versión, notas y botones', () => {
    const { el } = render();
    expect(el.textContent).toContain('Versión 1.0.1');
    expect(el.textContent).toContain('Notas de la versión');
    expect(el.querySelector('.btn--primary')?.textContent).toContain('Actualizar ahora');
    expect(el.querySelector('.btn--ghost')?.textContent).toContain('Más tarde');
  });

  it('click en "Actualizar ahora" → llama startDownload (el bridge)', () => {
    const { checker, el } = render();
    click(el.querySelector('.btn--primary'));
    expect(checker.startDownload).toHaveBeenCalledTimes(1);
  });

  it('click en "Más tarde" → llama dismissUpdate()', () => {
    const { checker, el } = render();
    click(el.querySelector('.btn--ghost'));
    expect(checker.dismissUpdate).toHaveBeenCalledTimes(1);
  });

  it('descarga en curso sin progreso → spinner (sin barra)', () => {
    const { el } = render({ type: 'downloading', progress: null });
    expect(el.querySelector('.spinner')).toBeTruthy();
    expect(el.querySelector('.progress-fill')).toBeFalsy();
    expect(el.querySelector('.btn')).toBeFalsy(); // botón deshabilitado en descarga
  });

  it('descarga en curso con progreso → barra al % correcto', () => {
    const { el } = render({ type: 'downloading', progress: 0.5 });
    const fill = el.querySelector('.progress-fill') as HTMLElement;
    expect(fill).toBeTruthy();
    expect(fill.style.width).toBe('50%');
    expect(el.textContent).toContain('50%');
  });

  it('lista para instalar → botón "Instalar ahora" llama installReady', () => {
    const { checker, el } = render({ type: 'ready' });
    expect(el.textContent).toContain('Lista para instalar');
    click(el.querySelector('.btn--primary'));
    expect(checker.installReady).toHaveBeenCalledTimes(1);
  });

  it('error de descarga → mensaje + Reintentar que reinicia la descarga', () => {
    const { checker, el } = render({ type: 'error', message: 'La descarga falló.' });
    expect(el.textContent).toContain('La descarga falló.');
    click(el.querySelector('.btn--primary'));
    expect(checker.startDownload).toHaveBeenCalledTimes(1);
    expect(checker.installReady).not.toHaveBeenCalled();
  });

  it('error de instalación (orígenes desconocidos) → Reintentar vuelve a instalar', () => {
    const { checker, el } = render({
      type: 'error',
      install: true,
      message: 'Habilitá la instalación de orígenes desconocidos y reintentá.',
    });
    expect(el.textContent).toContain('orígenes desconocidos');
    click(el.querySelector('.btn--primary'));
    expect(checker.installReady).toHaveBeenCalledTimes(1);
    expect(checker.startDownload).not.toHaveBeenCalled();
  });
});