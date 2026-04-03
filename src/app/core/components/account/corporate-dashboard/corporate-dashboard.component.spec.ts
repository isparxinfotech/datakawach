import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CorporateDashboardComponent } from './corporate-dashboard.component';
import {
  SHALLOW_COMPONENT_TEST_IMPORTS,
  SHALLOW_COMPONENT_TEST_SCHEMAS
} from 'src/testing/shallow-test-setup';

describe('CorporateDashboardComponent', () => {
  let component: CorporateDashboardComponent;
  let fixture: ComponentFixture<CorporateDashboardComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [CorporateDashboardComponent],
      imports: SHALLOW_COMPONENT_TEST_IMPORTS,
      schemas: SHALLOW_COMPONENT_TEST_SCHEMAS
    });
    fixture = TestBed.createComponent(CorporateDashboardComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
