import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { CepLookupService } from '../../core/services/cep-lookup.service';
import { ProfileApiService } from '../../core/services/profile-api.service';
import { RegisterPageComponent } from './register-page.component';

describe('RegisterPageComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RegisterPageComponent],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            register: () => of(null),
            syncProfile: () => undefined,
          },
        },
        {
          provide: ProfileApiService,
          useValue: {
            uploadMyAvatar: () => of(null),
          },
        },
        {
          provide: CepLookupService,
          useValue: {
            formatZipCode: (value: string) => value,
            lookup: () =>
              of({
                zipCode: '',
                addressLine: '',
                city: '',
                state: '',
                addressComplement: '',
              }),
          },
        },
      ],
    }).compileComponents();
  });

  function createComponent() {
    return TestBed.createComponent(RegisterPageComponent)
      .componentInstance as RegisterPageComponent & {
      phone: string;
      formatPhone(value: string): string;
    };
  }

  it('starts with an empty phone field and uses the placeholder only as hint', () => {
    const component = createComponent();

    expect(component.phone).toBe('');
  });

  it('keeps the country code from being recycled as the area code while deleting', () => {
    const component = createComponent();

    expect(component.formatPhone('+55 (11) 999-9000')).toBe(
      '+55 (11) 9999-000',
    );
  });

  it('still supports Brazilian numbers whose area code is 55', () => {
    const component = createComponent();

    expect(component.formatPhone('+55 (55) 98765-4321')).toBe(
      '+55 (55) 98765-4321',
    );
  });
});
