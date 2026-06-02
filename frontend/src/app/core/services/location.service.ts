import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class LocationService {
  city = 'São Paulo, SP';

  async loadLocation() {
    if (!navigator.geolocation) {
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;

          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`,
          );

          const data = await response.json();

          const city =
            data.address.city || data.address.town || data.address.village;

          const state = data.address.state;

          this.city = `${city}, ${state}`;
        } catch (error) {
          console.error(error);
        }
      },
      (error) => {
        console.error('Erro ao obter localização:', error);
      },
    );
  }
}
