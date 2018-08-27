(function () {
  'use strict';

  angular
      .module('app.searchState')
      .controller('searchCtrl', searchCtrl);

  searchCtrl.$inject = [
    '$ionicPlatform',
    '$q',
    '$scope',
    '$timeout',
    'locationsSrvc',
    'speciesSrvc',
    'sightingsSrvc',
    '$state',
    '$stateParams',
    'toaster',
    // from state.resolve
    'location',
    'postcode'
  ];

  function searchCtrl(
    $ionicPlatform,
    $q,
    $scope,
    $timeout,
    locationsSrvc,
    speciesSrvc,
    sightingsSrvc,
    $state,
    $stateParams,
    toaster,
    location,
    postcode
  ) {

    console.log("\n\n•• searchCtrl: location, postcode - ",location,postcode);

    var vm = angular.extend(this, {
    });

    vm.hardwareBackButton = $ionicPlatform.registerBackButtonAction(function() {
        //called when hardware back button pressed
    }, 100);
    $scope.$on('$destroy', vm.hardwareBackButton);

    var startingZoom = 16;
    var currentMapZoom = startingZoom;
    var clusterMarkers = L.markerClusterGroup();

    vm.mapData = []; // dirty hack to work around having to filter client-side; this should be better handled with a service to store and manage data

    vm.fromDate = null;
    vm.fromDateOpened = false;
    vm.handleFromDateOpen = function handleFromDateOpen(){
      console.log("click!");
      vm.fromDateOpened = true;
      vm.toDateOpened = false;
    };

    vm.toDate = null;
    vm.toDateOpened = false;
    vm.handleToDateOpen = function handleToDateOpen(){
      console.log("click!");
      vm.toDateOpened = true;
      vm.fromDateOpened = false;
    };

    vm.fromDateChange = function fromDateChange(e) {
      vm.refreshMap( vm.postcode );
    };

    vm.toDateChange = function toDateChange(e) {
      vm.refreshMap( vm.postcode );
    };

    //Controller below
    var createMap = function( mapPosition ) {
      var latlng =[ mapPosition.latitude, mapPosition.longitude ];

      var mymap = L.map('mymap', { center: latlng,
                                   zoom: startingZoom, minZoom: 1,  maxZoom: 18,
                                   zoomControl: true } );

//      L.control.zoom({
//        position:'topright'
//      }).addTo('mymap');

      L.tileLayer('https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token={accessToken}', {
        attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, Imagery © <a href="http://mapbox.com">Mapbox</a>',
        maxZoom: 18,
        id: 'mapbox.streets',
        accessToken: 'pk.eyJ1IjoiYWxpY2VkaWdpdGFsbGFicyIsImEiOiJjamF3YnA1a3UwbWliMnZta3B5b3NpbDBzIn0.39_7KL6gzUbNJEsbeYkpVg'
      }).addTo(mymap);



      clusterMarkers = L.markerClusterGroup();
      mymap.addLayer(clusterMarkers);


      // events
      mymap.on('resize moveend', handleMapMoveEvent );
      mymap.on('zoomlevelschange zoomend', handleMapZoomEvent );

      return mymap;
    };

    var removeMarker = function(map, marker){
      map.removeLayer(marker);
    };

    var removeAllMarkers = function(){
      mymap.removeLayer(clusterMarkers);
      clusterMarkers = L.markerClusterGroup(); //re-new clusters 
    };

    vm.centerMap = function centerMap( location ){
        createMap( location );
    };

    vm.refreshMap = function( postcode ) {
      vm.postcode = postcode;
      vm.busy = true;
      removeAllMarkers();

      getSightingsForPostcode( postcode );
    };

    function getSightingsForPostcode( postcode ) {
      var fromEpoch = vm.fromDate ? vm.fromDate.getTime() : undefined;
      var toEpoch = vm.toDate ? vm.toDate.getTime() : undefined;
      console.log( "getSightingsForPostcode " + postcode, fromEpoch, toEpoch );
      sightingsSrvc.getSightings( postcode, fromEpoch, toEpoch ).then(
        function gotSightingsForPostcodeOkay( data ) {
          gotSightingsForPostcode( data );
        },
        function getSightingsForPostcodeError(err) {
          console.log("error from getsightings:", err);
        }
      ).then( function() {
          vm.busy = false;
        }
      );
    }

    function gotSightingsForPostcode(result){
      console.log("result from getsightings:", result );
      result.data.forEach(function(e,index){
        var marker = undefined;
        // turn the thing-ID into a string
        speciesSrvc.getSpeciesFromId(e.thing).then(
          function turnedIdIntoASpecies( payload ){
            marker = L.marker(new L.LatLng(e.lat, e.lon),{
              species: payload.data.name,
              date: new Date(e.date).toLocaleDateString(),
              time: new Date(e.date).toLocaleTimeString(),
              location: e.postcode
            });
            console.log("turnedIdIntoASpecies", payload.data.name);
            marker.bindPopup( payload.data.name+"<br>"+new Date(e.date).toLocaleString()+"<br>"+e.postcode );
            clusterMarkers.addLayer( marker );
          },
          function errorGettingSpeciesFromID( error ) {
            marker = L.marker(new L.LatLng(e.lat, e.lon),{
              species: e.thing+"(problem with Species service)",
              date: new Date(e.date).toLocaleDateString(),
              time: new Date(e.date).toLocaleTimeString(),
              location: e.postcode
            });
            console.log("errorGettingSpeciesFromID, ", error);
            marker.bindPopup( e );
            clusterMarkers.addLayer( marker );
          }
        );

        mymap.addLayer( clusterMarkers );
      });
      clusterMarkers.on('clustermouseover', function (a) {
	      // a.layer is actually a cluster
        var popup = L.popup()
            .setLatLng(a.layer.getLatLng())
            .setContent(
              "<table class='species-cluster'><thead><tr><td class='first'>Species</td><td>Date</td><td>Time</td><td>Location</td></tr></thead><tbody>"+
                (a.layer.getAllChildMarkers().reduce(function(flat,toFlatten){
                  return( flat+"<tr>"+"<td class='name'>"+toFlatten.options.species+"</td>"+"<td>"+[ toFlatten.options.date, toFlatten.options.time, toFlatten.options.location].join("</td><td>")+"</td></tr>" );
                },""))+
                "</tbody></table>"
            )
            .openOn(mymap);
      }).on('clustermouseout',function(c){
        mymap.closePopup();
      }).on('clusterclick',function(c){
          mymap.closePopup();
      });
    }

    function handleMapZoomEvent() {
      if (mymap.getZoom()<currentMapZoom) {
        getCenterAndRadius();
      }
      currentMapZoom = mymap.getZoom();
    }

    function handleMapMoveEvent() {
      getCenterAndRadius();
    }

    function getCenterAndRadius() {
      var centerLatLong = mymap.getCenter();
      var mapBounds = mymap.getBounds();
      var distance = mymap.distance(mapBounds._northEast, mapBounds._southWest );

      // zap the markers
      removeAllMarkers();

      // get the postcodes in this area
      locationsSrvc.locationToPostcode({latitude:centerLatLong.lat, longitude:centerLatLong.lng}, distance).then(
        function gotPostcodeSet( data ){
          var postcodes = [];
          if ( data.result !== null ) {
            postcodes = data.result.map( function(item, index){
              console.log(item);
              return item.postcode;
            },[]);
          }
          console.log("postcodes here are:", postcodes);
          if(postcodes.length>0) {
            vm.postcode = postcodes[0];
          }
          // get data for postcodes
          var sightings = [];
          for(var i in postcodes) {
            console.log(" queueing up for "+postcodes[i]);
            sightings.push( sightingsSrvc.getSightings( postcodes[i] )
                            .then(
                              function gotBulkSightings(result){
                                gotSightingsForPostcode(result);
                              },
                              function gotBulkSightingsError(error){
                                console.log("problem getting bulk sightings",error);
                              }
                            )
                          );
          }
          $q.all(sightings).then(
            function( data ) {
              console.log("got em all!");
            },
            function( error ) {
              console.log("oh heck, "+error);
            }
          ).then(
            function(){
              vm.busy = false;
            }
          );
        },
        function failedPostcodeSet( error) {
          console.log( "error getting postcodes! ");
          // @TODO
          toaster.pop('warning', "Oops: Postcode Error", 'There was a a problem retrieving postcodes; please check <ul><li>You are connected to the internet</li><li>You are not stuck in a captive portal page</li></ul>',0, 'trustedHtml', function(toaster) {
            alert("click!");
            return true;
          } );

        }
      );
    }

//////


    vm.clearMap = function(){
      removeAllMarkers();
    };
    vm.goHome = function() {
      $state.go("home");
    };

    vm.busy = false;

    var mymap = createMap( location );
    var clusterMarkers = L.markerClusterGroup();
    mymap.addLayer(clusterMarkers);

    // find what's there
    if( location.postcode ) {
      console.log("refresingMap! ... ");
      vm.refreshMap( location.postcode );
    }

    if( angular.isDefined( location.postcode ) === true ) {
      vm.postcode = location.postcode;
    } else {
      console.log("*** no postcode!!!", location, postcode);
      //vm.postcode = "W1T 2PR"; // central london tells us we have the wrong location somehow
    }
  }
})();
