import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PhotographerDashboardComponent } from './photographer-dashboard.component';
import {
  SHALLOW_COMPONENT_TEST_IMPORTS,
  SHALLOW_COMPONENT_TEST_SCHEMAS
} from 'src/testing/shallow-test-setup';

describe('PhotographerDashboardComponent', () => {
  let component: PhotographerDashboardComponent;
  let fixture: ComponentFixture<PhotographerDashboardComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [PhotographerDashboardComponent],
      imports: SHALLOW_COMPONENT_TEST_IMPORTS,
      schemas: SHALLOW_COMPONENT_TEST_SCHEMAS
    });
    fixture = TestBed.createComponent(PhotographerDashboardComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
