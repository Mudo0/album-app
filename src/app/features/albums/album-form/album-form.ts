import { Component, inject, input, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Location } from '@angular/common';
import { Router } from '@angular/router';
import { AlbumService } from '../../../core/services/album.service';
import { BackButton } from '../../../shared/components/back-button/back-button';

@Component({
  selector: 'app-album-form',
  standalone: true,
  imports: [FormsModule, BackButton],
  templateUrl: './album-form.html',
  styleUrl: './album-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlbumForm implements OnInit {
  private readonly albumService = inject(AlbumService);
  private readonly router = inject(Router);
  private readonly location = inject(Location);

  /** Si se provee, estamos en modo edición */
  readonly id = input<string>();

  readonly name = signal('');
  readonly saving = signal(false);
  readonly loading = signal(false);

  get isEditing(): boolean {
    return !!this.id();
  }

  async ngOnInit(): Promise<void> {
    const albumId = this.id();
    if (!albumId) return;

    this.loading.set(true);
    const album = await this.albumService.getById(albumId);
    if (album) {
      this.name.set(album.name);
    }
    this.loading.set(false);
  }

  async save(): Promise<void> {
    const trimmed = this.name().trim();
    if (!trimmed || this.saving()) return;

    this.saving.set(true);

    const albumId = this.id();
    if (albumId) {
      await this.albumService.update(albumId, { name: trimmed });
      // Pantalla transitiva: volvemos al listado y el edit no queda en el historial
      this.location.back();
    } else {
      const album = await this.albumService.create({ name: trimmed });
      // Reemplazamos el form "new" en el historial: el volver desde el detail
      // cae en el listado, no en el formulario vacío
      this.router.navigate(['/albums', album.id], { replaceUrl: true });
    }
  }
}
