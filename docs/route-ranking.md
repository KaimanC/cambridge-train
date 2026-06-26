# Route ranking logic

1. The browser supplies coordinates when permission is granted. The UI also exposes a TfL station search override.
2. TfL Journey Planner estimates the access leg from the current coordinates or chosen station to:
   - King's Cross St. Pancras Underground for King's Cross mainline.
   - King's Cross St. Pancras Underground for St Pancras Thameslink.
   - Farringdon Underground for Farringdon Thameslink.
   - Liverpool Street Underground for Liverpool Street mainline.
3. A fixed interchange buffer is added after the TfL arrival:
   - King's Cross: 6 minutes.
   - St Pancras Thameslink: 8 minutes.
   - Farringdon Thameslink: 4 minutes.
   - Liverpool Street: 6 minutes.
4. Realtime Trains returns Cambridge-bound services from KGX, STP, ZFD and LST. The default lookahead is 12 hours so overnight first-service options can be ranked. The app fetches service detail for candidate trains when the board response does not include Cambridge arrival data, so it can rank by Cambridge (CBG) arrival, not London departure.
5. A train is considered catchable only when its live departure is at or after `TfL arrival + interchange buffer`.
6. Candidate routes are sorted by Cambridge arrival time, then by London departure time. The UI shows the top three.

Assumptions:

- Cambridge means Cambridge station (`CBG`), not Cambridge North.
- Fixed interchange buffers are conservative estimates for getting from Underground or Elizabeth line platforms to the relevant mainline/Thameslink platforms. TfL leg durations may already include some platform walking; the buffer is intentionally retained so tight connections are not over-ranked.
- King's Cross and St Pancras share the same TfL destination stop, but they are ranked separately because train departures and interchange buffers differ.
- Farringdon is not a terminus, but it is included because Cambridge-bound Thameslink trains call there.
- When Realtime Trains credentials are absent, train data is mocked so the app can be deployed and tested before live keys are added.
