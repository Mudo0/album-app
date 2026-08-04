import {
  Component,
  inject,
  input,
  signal,
  viewChild,
  ElementRef,
  ChangeDetectionStrategy,
  OnDestroy,
} from '@angular/core';
import { Location } from '@angular/common';
import { ImageService } from '../../../core/services/image.service';
import { BackButton } from '../../../shared/components/back-button/back-button';

interface PreviewFile {
  file: File;
  url: string;
}

@Component({
  selector: 'app-image-uploader',
  standalone: true,
  imports: [BackButton],
  templateUrl: './image-uploader.html',
  styleUrl: './image-uploader.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImageUploader implements OnDestroy {
  private readonly imageService = inject(ImageService);
  private readonly location = inject(Location);

  readonly id = input.required<string>();

  readonly files = signal<PreviewFile[]>([]);
  readonly saving = signal(false);

  private readonly fileInputRef =
    viewChild.required<ElementRef<HTMLInputElement>>('fileInput');

  openPicker(): void {
    this.fileInputRef().nativeElement.click();
  }

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const selected = Array.from(input.files ?? []);

    const previews: PreviewFile[] = selected.map((file) => ({
      file,
      url: URL.createObjectURL(file),
    }));

    this.files.update((current) => [...current, ...previews]);

    // Reset para permitir seleccionar los mismos archivos de nuevo
    input.value = '';
  }

  removeFile(index: number): void {
    const removed = this.files()[index];
    URL.revokeObjectURL(removed.url);
    this.files.update((current) => current.filter((_, i) => i !== index));
  }

  async save(): Promise<void> {
    if (this.saving() || this.files().length === 0) return;

    this.saving.set(true);
    const albumId = this.id();

    for (const preview of this.files()) {
      await this.imageService.add(albumId, preview.file);
    }

    // Volver atrás en vez de forward — evita duplicar el detail en el historial
    this.location.back();
  }

  ngOnDestroy(): void {
    for (const preview of this.files()) {
      URL.revokeObjectURL(preview.url);
    }
  }
}
