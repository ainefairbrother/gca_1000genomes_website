import { Injectable }     from '@angular/core';
import { Http, Response } from '@angular/http';
import { Observable } from 'rxjs/Observable';
import { ReplaySubject } from 'rxjs/ReplaySubject';
import 'rxjs/add/operator/map';
import 'rxjs/add/observable/of';

import { SearchHits } from '../../shared/api-types/search-hits';
import { Population } from '../../shared/api-types/population';
import { ApiTimeoutService } from './api-timeout.service';
import { ApiErrorService } from './api-error.service';

@Injectable()
export class ApiPopulationService {

  constructor(
    private http: Http,
    private apiErrorService: ApiErrorService,
    private apiTimeoutService: ApiTimeoutService,
  ) {}

  // private properties:
  private popListSource: ReplaySubject<SearchHits<Population>>;

	//public properties
	readonly elasticIdDescriptionMap: {[key: string]: string} = {};

  // public methods

  getAll(): Observable<SearchHits<Population>>{
    if (!this.popListSource) {
      this.setPopListSource();
    }
    return this.popListSource.asObservable();
  }


  search(hitsPerPage: number, from: number, query: any): Observable<SearchHits<Population>>{
    let body = {
      from: from,
      size: hitsPerPage,
      _source: true,
      fields: [ 'dataCollections._analysisGroups' ],
    };
    if (query) {
      body['query'] = query;
    }
    return this.apiTimeoutService.handleTimeout<SearchHits<Population>>(
      this.apiErrorService.handleError(
        this.http.post(`/api/beta/population/_search`, body)
      ).map((r:Response): SearchHits<Population> => {
        let h: {hits: SearchHits<Population>} = r.json() as {hits: SearchHits<Population>};
        return h.hits;
      })
    );
  }

  get(code: string): Observable<Population>{
   return this.apiTimeoutService.handleTimeout<Population>(
      this.apiErrorService.handleError(
        this.http.get(`/api/beta/population/${code}`)
      ).map((r: Response) => {
        let s = r.json() as {_source: Population};
        return s._source;
      })
    );
  }

  searchExport(query: any, filename: string){
    let body = {
      fields: [
        'code', 'elasticId', 'name', 'description', 'latitude', 'longitude', 'superpopulation.code', 'superpopulation.name', 'superpopulation.display_colour', 'superpopulation.display_order', 'dataCollections.title',
      ],
      column_names: [
        'Population code', 'Population elastic ID', 'Population name', 'Population description', 'Population latitude', 'Population longitude', 'Superpopulation code', 'Superpopulation name', 'Superpopulation display colour', 'Superpopulation display order', 'Data collections',
      ],
    };
    if (query) {
      body['query'] = query;
    }
    let form = document.createElement('form');

    form.action= `/api/beta/population/_search/${filename}.tsv`;
    form.method='POST';
    form.target="_self";
    let input = document.createElement("textarea");
    input.setAttribute('type', 'hidden');
    input.setAttribute('name', 'json');
    input.value = JSON.stringify(body);
    form.appendChild(input);
    form.style.display = 'none';
    document.body.appendChild(form);
    form.submit();
  }

  searchDataCollectionPopulations(dc: string, offset: number, hitsPerPage: number): Observable<SearchHits<Population>> {
    let query = {
      constant_score: {
        filter: {
          term: { 'dataCollections.title': dc }
        }
      }
    }
    return this.search(hitsPerPage, offset, query);
  }

  searchDataCollectionPopulationsExport(dc: string) {
    let filename: string = dc.toLowerCase();
    filename.replace(/\s/g, '-');
    let query = {
      constant_score: {
        filter: {
          term: { 'dataCollections.title': dc }
        }
      }
    }
    return this.searchExport(query, `igsr-${filename}-populations.tsv`);
  }

  // private methods

  private setPopListSource() {
    let query = {
      size: -1,
      sort: ['display_order'],
      _source: ['elasticId', 'description', 'display_order', 'superpopulation.name'],
    };
    this.popListSource = new ReplaySubject<SearchHits<Population>>(1);
    this.apiTimeoutService.handleTimeout<SearchHits<Population>>(
      this.apiErrorService.handleError(
        this.http.post(`/api/beta/population/_search`, query)
      ).map((r:Response): SearchHits<Population> => {
          let h: {hits: SearchHits<Population>} = r.json() as {hits: SearchHits<Population>};
					for (let pop of h.hits.hits) {
						if(pop._source.elasticId && pop._source.description) {
							this .elasticIdDescriptionMap[pop._source.elasticId] = pop._source.description;
						}
					}
          return h.hits;
      })
    ).subscribe((h: SearchHits<Population>) => this.popListSource.next(h));
  }

  textSearch(text: string, hitsPerPage: number): Observable<SearchHits<Population>> {
    if (!text) {
      return Observable.of<SearchHits<Population>>(null);
    }
    let query = {
      multi_match: {
        query: text,
        fields: [
          'name.std',
          'code.std',
					'elasticId.std',
          'description.std',
          'dataCollections.title.std',
          'superpopulation.code.std',
          'superpopulation.name.std',
        ],
      }
    }
    return this.search(hitsPerPage, 0, query);
  }
}
