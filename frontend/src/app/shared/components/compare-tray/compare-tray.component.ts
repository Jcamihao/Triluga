import { CommonModule } from '@angular/common';
import { Component, inject, DestroyRef } from '@angular/core';
import { Router, RouterLink, NavigationEnd } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { CompareService } from '../../../core/services/compare.service';

@Component({
  selector: 'app-compare-tray',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './compare-tray.component.html',
  styleUrls: ['./compare-tray.component.scss'],
})
export class CompareTrayComponent {
  protected readonly compareService = inject(CompareService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected collapsed = this.router.url.startsWith('/compare');

  constructor() {
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe((e) => {
      // Auto-collapse when entering /compare, auto-expand when leaving
      this.collapsed = (e as NavigationEnd).urlAfterRedirects.startsWith('/compare');
    });
  }

  protected toggleCollapsed() {
    this.collapsed = !this.collapsed;
  }

  protected trackById(_index: number, item: { id: string }) {
    return item.id;
  }
}
