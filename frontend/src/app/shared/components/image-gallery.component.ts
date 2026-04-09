import { CommonModule } from '@angular/common';
import { Component, Input, signal } from '@angular/core';

@Component({
  selector: 'app-image-gallery',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './image-gallery.component.html',
  styleUrls: ['./image-gallery.component.scss'],
})
export class ImageGalleryComponent {
  @Input() images: Array<{ url: string }> = [];

  protected readonly activeIndex = signal(0);
  protected readonly fallbackImage =
    'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=1200&q=80';

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
}
