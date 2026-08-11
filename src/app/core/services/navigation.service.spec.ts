import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, Routes } from '@angular/router';
import { Component } from '@angular/core';
import { Location } from '@angular/common';
import { NavigationService } from './navigation.service';

@Component({ selector: 'app-host', template: '', standalone: true })
class Host {}

const routes: Routes = [
  { path: 'albums', component: Host },
  { path: 'albums/:id', component: Host, data: { backTo: '/albums' } },
  { path: 'albums/:id/edit', component: Host, data: { backTo: '/albums' } },
  {
    path: 'albums/:id/upload',
    component: Host,
    data: { backTo: '/albums/:id' },
  },
];

describe('NavigationService', () => {
  async function setup() {
    await TestBed.configureTestingModule({
      imports: [Host],
      providers: [provideRouter(routes)],
    }).compileComponents();

    const service = TestBed.inject(NavigationService);
    const router = TestBed.inject(Router);
    return { service, router };
  }

  it('should navigate to backTo route when deep linked to edit (no history)', async () => {
    const { service, router } = await setup();
    const navigateByUrlSpy = vi.spyOn(router, 'navigateByUrl');

    await router.navigateByUrl('/albums/abc/edit');

    service.back();

    expect(navigateByUrlSpy).toHaveBeenCalledWith('/albums', {
      replaceUrl: true,
    });
  });

  it('should resolve params in backTo when deep linked to upload', async () => {
    const { service, router } = await setup();
    const navigateByUrlSpy = vi.spyOn(router, 'navigateByUrl');

    await router.navigateByUrl('/albums/abc/upload');

    service.back();

    expect(navigateByUrlSpy).toHaveBeenCalledWith('/albums/abc', {
      replaceUrl: true,
    });
  });

  it('should fall back to default route when current route has no backTo', async () => {
    const { service, router } = await setup();
    const navigateByUrlSpy = vi.spyOn(router, 'navigateByUrl');

    await router.navigateByUrl('/albums');

    service.back();

    expect(navigateByUrlSpy).toHaveBeenCalledWith('/albums', {
      replaceUrl: true,
    });
  });

  it('should use browser history back when user navigated within the app', async () => {
    const { service, router } = await setup();
    const backSpy = vi.spyOn(TestBed.inject(Location), 'back');

    await router.navigateByUrl('/albums/abc');
    await router.navigateByUrl('/albums/abc/edit');

    const navigateByUrlSpy = vi.spyOn(router, 'navigateByUrl');
    service.back();

    expect(backSpy).toHaveBeenCalled();
    expect(navigateByUrlSpy).not.toHaveBeenCalled();
  });

  it('should navigate to album detail replacing the current screen', async () => {
    const { router } = await setup();
    const navigateByUrlSpy = vi.spyOn(router, 'navigateByUrl');

    TestBed.inject(NavigationService).toAlbumDetail('new1');

    expect(navigateByUrlSpy).toHaveBeenCalledWith('/albums/new1', {
      replaceUrl: true,
    });
  });
});
