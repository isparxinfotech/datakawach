import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CreateCorporateAccountComponent } from './create-corporate-account.component';
import {
  SHALLOW_COMPONENT_TEST_IMPORTS,
  SHALLOW_COMPONENT_TEST_SCHEMAS
} from 'src/testing/shallow-test-setup';

describe('CreateCorporateAccountComponent', () => {
  let component: CreateCorporateAccountComponent;
  let fixture: ComponentFixture<CreateCorporateAccountComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [CreateCorporateAccountComponent],
      imports: SHALLOW_COMPONENT_TEST_IMPORTS,
      schemas: SHALLOW_COMPONENT_TEST_SCHEMAS
    });
    fixture = TestBed.createComponent(CreateCorporateAccountComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
