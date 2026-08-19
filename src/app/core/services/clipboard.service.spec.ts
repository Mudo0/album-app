import { TestBed } from '@angular/core/testing';
import { ClipboardService } from './clipboard.service';
import { CLIPBOARD_PLUGIN } from '../tokens/clipboard-plugin.token';
import type { ClipboardPluginInterface } from '../interfaces/clipboard-plugin.interface';

describe('ClipboardService', () => {
  const plugin = {
    copyImageToClipboard: vi.fn(),
  } as unknown as ClipboardPluginInterface;

  let service: ClipboardService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: CLIPBOARD_PLUGIN, useValue: plugin }],
    });
    service = TestBed.inject(ClipboardService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should delegate copyImageToClipboard with uri and default options', async () => {
    vi.mocked(plugin.copyImageToClipboard).mockResolvedValue({ success: true });

    await service.copyImageToClipboard('content://media/external/images/media/1');

    expect(plugin.copyImageToClipboard).toHaveBeenCalledWith({
      uri: 'content://media/external/images/media/1',
    });
  });

  it('should pass custom options when provided', async () => {
    vi.mocked(plugin.copyImageToClipboard).mockResolvedValue({ success: true });

    await service.copyImageToClipboard('content://media/external/images/media/1', {
      maxSize: 2048,
      quality: 95,
    });

    expect(plugin.copyImageToClipboard).toHaveBeenCalledWith({
      uri: 'content://media/external/images/media/1',
      maxSize: 2048,
      quality: 95,
    });
  });

  it('should propagate plugin errors', async () => {
    vi.mocked(plugin.copyImageToClipboard).mockRejectedValue(
      new Error('La imagen original ya no existe en la galería.'),
    );

    await expect(
      service.copyImageToClipboard('content://media/external/images/media/999'),
    ).rejects.toThrow('La imagen original ya no existe en la galería.');
  });
});
