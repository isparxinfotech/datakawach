import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DynamicMenusComponent } from './dynamic-menus.component';
import {
  SHALLOW_COMPONENT_TEST_IMPORTS,
  SHALLOW_COMPONENT_TEST_SCHEMAS
} from 'src/testing/shallow-test-setup';

describe('DynamicMenusComponent', () => {
  let component: DynamicMenusComponent;
  let fixture: ComponentFixture<DynamicMenusComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [DynamicMenusComponent],
      imports: SHALLOW_COMPONENT_TEST_IMPORTS,
      schemas: SHALLOW_COMPONENT_TEST_SCHEMAS
    });
    fixture = TestBed.createComponent(DynamicMenusComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
