import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class LocationService {
  city = '';       // "Brasília, Distrito Federal"
  cityName = '';   // "Brasília" (without state)

  async loadLocation(): Promise<void> {
    if (!navigator.geolocation) return;

    return new Promise<void>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          try {
            const { latitude, longitude } = position.coords;
            const response = await fetch(
              `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`,
            );
            const data = await response.json();
            const city = data.address.city || data.address.town || data.address.village;
            const state = data.address.state;
            if (city) {
              this.cityName = city;
              this.city = `${city}, ${state}`;
            }
          } catch (error) {
            console.error(error);
          } finally {
            resolve();
          }
        },
        (error) => {
          console.error('Erro ao obter localização:', error);
          resolve();
        },
        { enableHighAccuracy: true, timeout: 5000 },
      );
    });
  }
}
