import { CommonModule } from '@angular/common';
import {
  Component,
  HostListener,
  Input,
  OnDestroy,
  signal,
} from '@angular/core';

@Component({
  selector: 'app-image-gallery',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './image-gallery.component.html',
  styleUrls: ['./image-gallery.component.scss'],
})
export class ImageGalleryComponent implements OnDestroy {
  @Input() images: Array<{ url: string }> = [];

  protected readonly activeIndex = signal(0);
  protected readonly previewOpen = signal(false);
  protected readonly fallbackImage =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='280' viewBox='0 0 400 280'%3E%3Crect width='400' height='280' fill='%23f1f5f9'/%3E%3Cpath d='M60 180 L80 145 L110 108 L290 108 L320 145 L340 180 L340 196 L60 196Z' fill='%23cbd5e1'/%3E%3Cpath d='M115 108 L135 72 L265 72 L285 108Z' fill='%2394a3b8'/%3E%3Cpath d='M140 74 L154 74 L154 102 L130 102Z' fill='%23e2e8f0'/%3E%3Cpath d='M162 70 L238 70 L248 102 L152 102Z' fill='%23e2e8f0'/%3E%3Cpath d='M246 74 L260 74 L270 102 L246 102Z' fill='%23e2e8f0'/%3E%3Ccircle cx='115' cy='196' r='28' fill='%2364748b'/%3E%3Ccircle cx='115' cy='196' r='16' fill='%2394a3b8'/%3E%3Ccircle cx='285' cy='196' r='28' fill='%2364748b'/%3E%3Ccircle cx='285' cy='196' r='16' fill='%2394a3b8'/%3E%3C/svg%3E";

  protected activeImage() {
    return this.images[this.activeIndex()] ?? null;
  }

  protected goToPreviousImage() {
    if (!this.images.length) {
      return;
    }

    const previousIndex =
      (this.activeIndex() - 1 + this.images.length) % this.images.length;
    this.activeIndex.set(previousIndex);
  }

  protected goToNextImage() {
    if (!this.images.length) {
      return;
    }

    const nextIndex = (this.activeIndex() + 1) % this.images.length;
    this.activeIndex.set(nextIndex);
  }

  protected openPreview(index = this.activeIndex()) {
    if (!this.images.length) {
      return;
    }

    this.activeIndex.set(index);
    this.previewOpen.set(true);
    document.body.classList.add('gallery-preview-open');
  }

  protected closePreview() {
    this.previewOpen.set(false);
    document.body.classList.remove('gallery-preview-open');
  }

  ngOnDestroy() {
    document.body.classList.remove('gallery-preview-open');
  }

  @HostListener('document:keydown', ['$event'])
  protected handleKeyboard(event: KeyboardEvent) {
    if (!this.previewOpen()) {
      return;
    }

    if (event.key === 'Escape') {
      this.closePreview();
      return;
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.goToPreviousImage();
      return;
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.goToNextImage();
    }
  }
}
