import { inject, Injectable, DestroyRef } from '@angular/core';
import { Location } from '@angular/common';
import { ActivatedRouteSnapshot, NavigationEnd, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';

/**
 * Navegación centralizada con jerarquía definida.
 *
 * Cada ruta declara su destino de retorno en `data.backTo` (ej: '/albums/:id').
 * `back()` vuelve por el historial real del navegador cuando el usuario navegó
 * dentro de la app; si entró directo a la URL (deep link) o refrescó, navega al
 * destino determinístico que define la jerarquía, evitando salir de la app.
 */
@Injectable({ providedIn: 'root' })
export class NavigationService {
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly destroyRef = inject(DestroyRef);

  /** Ruta predeterminada para rutas sin destino de retorno definido */
  readonly defaultRoute = '/albums';

  /** Navegaciones internas completadas — permite detectar deep links/refrescos */
  private navigationCount = 0;

  constructor() {
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.navigationCount++);
  }

  /**
   * Vuelve a la pantalla anterior. Con historial interno usa el historial del
   * navegador; sin él (deep link o refresh) navega al destino de la jerarquía
   * de la ruta actual, o a `defaultRoute` si no hay destino definido.
   */
  back(): void {
    if (this.navigationCount > 1) {
      this.location.back();
    } else {
      this.router.navigateByUrl(this.resolveBackUrl(), { replaceUrl: true });
    }
  }

  /** Navega al detalle de un álbum reemplazando la pantalla transitiva actual */
  toAlbumDetail(albumId: string): void {
    this.router.navigateByUrl(`/albums/${albumId}`, { replaceUrl: true });
  }

  /** Destino determinístico según la jerarquía declarada por la ruta actual */
  private resolveBackUrl(): string {
    const leaf = this.currentLeaf();
    const template =
      (leaf.data['backTo'] as string | undefined) ?? this.defaultRoute;
    return template.replace(/:(\w+)/g, (_, key: string) => leaf.params[key] ?? '');
  }

  private currentLeaf(): ActivatedRouteSnapshot {
    let route = this.router.routerState.snapshot.root;
    while (route.firstChild) {
      route = route.firstChild;
    }
    return route;
  }
}
