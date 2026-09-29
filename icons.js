(function(root){
'use strict';
const paths={
 wave:'M3 15c3 0 3-6 6-6s3 6 6 6 3-6 6-6M3 20c3 0 3-6 6-6s3 6 6 6 3-6 6-6M3 10c3 0 3-6 6-6s3 6 6 6 3-6 6-6',
 overview:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
 ai:'M12 3v3m0 12v3M3 12h3m12 0h3M7 7l-2-2m12 2 2-2M7 17l-2 2m12-2 2 2M9 8h6a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z',
 memory:'M12 3 3 8l9 5 9-5-9-5ZM3 12l9 5 9-5M3 16l9 5 9-5',
 tasks:'M9 5h12M9 12h12M9 19h12M3 5l1 1 2-3M3 12l1 1 2-3M3 19l1 1 2-3',
 projects:'M3 7V5a1 1 0 0 1 1-1h5l2 3h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Z',
 clients:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m19 0v-2a4 4 0 0 0-3-4M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8-7a4 4 0 0 1 0 7',
 docs:'M14 2H5a1 1 0 0 0-1 1v18a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V8l-6-6Zm0 0v6h6M8 13h8M8 17h6',
 data:'M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7l-9-4Zm-4 9 3 3 5-6',
 orders:'M6 4h12v17H6V4ZM9 4V2h6v2M9 9h6M9 13h6M9 17h3',
 search:'M21 21l-5-5M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z',
 sun:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1',
 arrow:'M7 17 17 7M7 7h10v10',plus:'M12 5v14M5 12h14'};
root.NVIcon=name=>'<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+(paths[name]||paths.wave)+'"/></svg>';
})(globalThis);
