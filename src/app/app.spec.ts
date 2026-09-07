import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { App } from './app';
import { UpdateCheckerService } from './core/services/updates/update-checker.service';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        // El host monta UpdateDialog → checker real. En el test (web) el plugin
        // nativo 'Update' no existe y cualquier llamada rechaza; como en el resto
        // de los specs de componentes, se mockea el servicio.
        {
          provide: UpdateCheckerService,
          useValue: {
            available: signal(false),
            info: signal(null),
            download: signal({ type: 'idle' }),
            startDownload: vi.fn(),
            dismissUpdate: vi.fn(),
            installReady: vi.fn(),
          },
        },
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should render router-outlet', () => {
    const fixture = TestBed.createComponent(App);
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('router-outlet')).toBeTruthy();
  });
});