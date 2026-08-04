import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AlbumService } from '../../../core/services/album.service';

@Component({
  selector: 'app-album-form',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './album-form.html',
  styleUrl: './album-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlbumForm {
  private readonly albumService = inject(AlbumService);
  private readonly router = inject(Router);

  protected readonly name = signal('');
  protected readonly saving = signal(false);

  protected goBack(): void {
    this.router.navigate(['/albums']);
  }

  protected async save(): Promise<void> {
    const trimmed = this.name().trim();
    if (!trimmed || this.saving()) return;

    this.saving.set(true);
    await this.albumService.create({ name: trimmed });
    this.router.navigate(['/albums']);
  }
}
