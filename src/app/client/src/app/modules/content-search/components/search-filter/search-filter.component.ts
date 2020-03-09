import { Component, Output, EventEmitter, Input, OnInit, OnDestroy, OnChanges } from '@angular/core';
import * as _ from 'lodash-es';
import { LibraryFiltersLayout } from '@project-sunbird/common-consumption';
import { ResourceService } from '@sunbird/shared';
import { IInteractEventEdata } from '@sunbird/telemetry';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject, combineLatest, of } from 'rxjs';
import { takeUntil, debounceTime, map, mergeMap, filter, tap } from 'rxjs/operators';
import { ContentSearchService } from './../../services';

interface IFilters {
  board: string[];
  medium?: string[];
  gradeLevel?: string[];
}

@Component({
  selector: 'app-search-filter',
  templateUrl: './search-filter.component.html',
  styleUrls: ['./search-filter.component.scss']
})
export class SearchFilterComponent implements OnInit, OnDestroy {
  public filterLayout = LibraryFiltersLayout;
  private unsubscribe$ = new Subject<void>();

  private filters;
  private queryFilters: any = {};
  public selectedBoard: any = {};
  public selectedMediumIndex = 0;
  public selectedGradeLevelIndex = 0;

  public boards: any[] = [];
  public mediums: any[] = [];
  public gradeLevels: any[] = [];
  private selectedBoardLocalCopy: any = {};
  filterChangeEvent =  new Subject();
  @Input() defaultFilters;
  @Output() filterChange: EventEmitter<any> = new EventEmitter();

  constructor(public resourceService: ResourceService, private router: Router, private contentSearchService: ContentSearchService,
    private activatedRoute: ActivatedRoute) {
  }
  ngOnInit() {
    this.fetchSelectedFilterAndFilterOption();
    this.handleFilterChange();
  }
  private fetchSelectedFilterAndFilterOption() {
    this.activatedRoute.queryParams.pipe(map((queryParams) => {
      const queryFilters: any = {};
      _.forIn(queryParams, (value, key) => {
        if (['medium', 'gradeLevel', 'board'].includes(key)) {
          queryFilters[key] = _.isArray(value) ? value : [value];
        }
      });
      return queryFilters;
    }),
    filter((queryFilters) => {
      const selectedFilter = this.getSelectedFilter();
      if (_.isEqual(queryFilters, selectedFilter)) { // same filter change, no need to fetch filter again
        return false;
      } else if (_.isEqual(queryFilters.board, selectedFilter.board)) { // same board, no need to fetch filter again
        return false;
      }
      return true;
    }),
    mergeMap((queryParams) => {
      this.queryFilters = _.cloneDeep(queryParams);
      return this.contentSearchService.fetchFilter(_.get(queryParams, 'board[0]'));
    }))
    .subscribe(filters => {
      this.updateFilters(filters);
      this.emitFilterChangeEvent();
    }, error => {
      console.error('fetching filter data failed', error);
    });
  }
  private handleFilterChange() {
    this.filterChangeEvent.pipe(filter(({type, event}) => {
      if (type === 'medium' && this.selectedMediumIndex !== event.data.index) {
        this.selectedMediumIndex = event.data.index;
        return true;
      } else if (type === 'gradeLevel' && this.selectedGradeLevelIndex !== event.data.index) {
        this.selectedGradeLevelIndex = event.data.index;
        return true;
      }
      return false;
    }), debounceTime(1000)).subscribe(({type, event}) => {
      this.emitFilterChangeEvent();
    });
  }
  private updateFilters(filters) {
    this.filters = filters;
    if (!this.boards.length && this.filters.board) {
      this.boards = this.filters.board;
      this.selectedBoard = _.find(this.boards, {name: _.get(this.queryFilters, 'board[0]')}) ||
        _.find(this.boards, {name: _.get(this.defaultFilters, 'board[0]')}) || this.boards[0];
    }
    this.mediums = _.map(this.filters.medium, medium => medium.name);
    if (this.mediums.length) {
      let mediumIndex = -1;
      if (_.get(this.queryFilters, 'medium[0]')) {
        mediumIndex = this.mediums.findIndex((medium) => medium === this.queryFilters.medium[0]);
      }
      if (_.get(this.defaultFilters, 'medium[0]') && mediumIndex === -1) {
        mediumIndex = this.mediums.findIndex((medium) => medium === this.defaultFilters.medium[0]);
      }
      mediumIndex = mediumIndex === -1 ? 0 : mediumIndex;
      this.selectedMediumIndex = mediumIndex;
    }
    this.gradeLevels = _.map(this.filters.gradeLevel, gradeLevel => gradeLevel.name);
    if (this.gradeLevels.length) {
      let gradeLevelIndex = -1;
      if (_.get(this.queryFilters, 'gradeLevel[0]')) {
        gradeLevelIndex = this.gradeLevels.findIndex((gradeLevel) => gradeLevel === this.queryFilters.gradeLevel[0]);
      }
      if (_.get(this.defaultFilters, 'gradeLevel[0]') && gradeLevelIndex === -1) {
        gradeLevelIndex = this.gradeLevels.findIndex((gradeLevel) => gradeLevel === this.defaultFilters.gradeLevel[0]);
      }
      gradeLevelIndex = gradeLevelIndex === -1 ? 0 : gradeLevelIndex;
      this.selectedGradeLevelIndex = gradeLevelIndex;
    }
  }
  public onBoardChange(option) {
    if (this.selectedBoardLocalCopy.name === option.name) {
      return;
    }
    this.selectedBoardLocalCopy = option;
    this.contentSearchService.fetchFilter(option.name).subscribe((filters) => {
      this.updateFilters(filters);
      this.emitFilterChangeEvent();
    }, error => {
      console.error('fetching filters on board change error', error);
    });
  }
  private getSelectedFilter() {
    return {
      board: _.get(this.selectedBoard, 'name') ? [this.selectedBoard.name] : [],
      medium: this.mediums[this.selectedMediumIndex] ? [this.mediums[this.selectedMediumIndex]] : [],
      gradeLevel: this.gradeLevels[this.selectedGradeLevelIndex] ? [this.gradeLevels[this.selectedGradeLevelIndex]] : []
    };
  }
  private emitFilterChangeEvent() {
    const filters = this.getSelectedFilter();
    this.filterChange.emit(filters);
  }
  private updateUrlWithSelectedFilters() {
    const url = this.activatedRoute.snapshot.params.slug ? this.activatedRoute.snapshot.params.slug + '/explore' : 'explore';
    this.router.navigate([url], { queryParams: this.getSelectedFilter() });
  }
  public getBoardInteractEdata(selectedBoard) {
    const selectBoardInteractEdata: IInteractEventEdata = {
      id: 'board-select-button',
      type: 'click',
      pageid: this.router.url.split('/')[1] || 'library'
    };
    if (selectedBoard) {
      selectBoardInteractEdata['extra'] = {
        board: selectedBoard.name
      };
    }
    return selectBoardInteractEdata;
  }

  public getMediumInteractEdata() {
    const selectMediumInteractEdata: IInteractEventEdata = {
      id: 'medium-select-button',
      type: 'click',
      pageid: this.router.url.split('/')[1] || 'library'
    };
    if (this.selectedMediumIndex || this.selectedMediumIndex === 0) {
      selectMediumInteractEdata['extra'] = {
        medium: [this.mediums[this.selectedMediumIndex]]
      };
    }
    return selectMediumInteractEdata;
  }

  public getGradeLevelInteractEdata() {
    const selectGradeLevelInteractEdata: IInteractEventEdata = {
      id: 'grade-level-select-button',
      type: 'click',
      pageid: this.router.url.split('/')[1] || 'library'
    };
    if (this.selectedGradeLevelIndex || this.selectedGradeLevelIndex === 0) {
      selectGradeLevelInteractEdata['extra'] = {
        gradeLevel: [this.gradeLevels[this.selectedGradeLevelIndex]]
      };
    }
    return selectGradeLevelInteractEdata;
  }

  ngOnDestroy() {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }
}

