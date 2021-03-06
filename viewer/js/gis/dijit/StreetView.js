/*global google */
define([
    'dojo/_base/declare',
    'dijit/_WidgetBase',
    'dijit/_TemplatedMixin',
    'dijit/_WidgetsInTemplateMixin',
    'dijit/form/Button',
    'dojo/_base/lang',
    'dojo/aspect',
    'esri/layers/GraphicsLayer',
    'esri/graphic',
    'esri/renderers/SimpleRenderer',
    'dojo/text!./StreetView/templates/StreetView.html',
    'esri/renderers/UniqueValueRenderer',
    'esri/symbols/PictureMarkerSymbol',
    'dojo/on',
    'dojo/dom-style',
    'esri/geometry/Point',
    'esri/SpatialReference',
    'gis/dijit/_FloatingWidgetMixin',
    'dijit/MenuItem',
    'xstyle/css!./StreetView/css/StreetView.css',
    'gis/plugins/async!//maps.google.com/maps/api/js?v=3&sensor=false',
    '//cdnjs.cloudflare.com/ajax/libs/proj4js/2.2.1/proj4.js'
], function(declare, _WidgetBase, _TemplatedMixin, _WidgetsInTemplateMixin, Button, lang, aspect, GraphicsLayer, Graphic, SimpleRenderer, template, UniqueValueRenderer, PictureMarkerSymbol, on, domStyle, Point, SpatialReference, _FloatingWidgetMixin, MenuItem, css, gmaps, proj4) {

    return declare([_WidgetBase, _TemplatedMixin, _WidgetsInTemplateMixin, _FloatingWidgetMixin], {
        widgetsInTemplate: true,
        templateString: template,

        panoOptions: {
            addressControlOptions: {
                position: google.maps.ControlPosition.TOP_RIGHT
            },
            linksControl: false,
            panControl: false,
            zoomControlOptions: {
                style: google.maps.ZoomControlStyle.SMALL
            },
            enableCloseButton: false
        },

        // in case this changes some day
        proj4BaseURL: 'http://spatialreference.org/',

        //  options are ESRI, EPSG and SR-ORG
        // See http://spatialreference.org/ for more information
        proj4Catalog: 'EPSG',

        // if desired, you can load a projection file from your server
        // instead of using one from spatialreference.org
        // i.e., http://server/projections/102642.js
        projCustomURL: null,

        postCreate: function() {
            this.inherited(arguments);
            this.pointSymbol = new PictureMarkerSymbol(require.toUrl('gis/dijit/StreetView/images/blueArrow.png'), 30, 30);
            this.pointGraphics = new GraphicsLayer({
                id: 'streetview_graphics',
                title: 'Street View'
            });
            this.pointRenderer = new SimpleRenderer(this.pointSymbol);
            this.pointRenderer.label = 'Street View';
            this.pointRenderer.description = 'Street View';
            this.pointGraphics.setRenderer(this.pointRenderer);
            this.map.addLayer(this.pointGraphics);
            this.map.on('click', lang.hitch(this, 'getStreetView'));

            if (this.parentWidget.toggleable) {
                // domStyle.set(this.buttonActionBar, 'display', 'none');
                this.own(aspect.after(this.parentWidget, 'toggle', lang.hitch(this, function() {
                    this.onLayoutChange(this.parentWidget.open);
                })));
            }

            // spatialreference.org uses the old
            // Proj4js style so we need an alias
            // https://github.com/proj4js/proj4js/issues/23
            window.Proj4js = proj4;



            if (this.mapRightClickMenu) {
                this.map.on('MouseDown', lang.hitch(this, function(evt) {
                    this.mapRightClickPoint = evt.mapPoint;
                }));
                this.mapRightClickMenu.addChild(new MenuItem({
                    label: 'See Street View here',
                    onClick: lang.hitch(this, 'streetViewFromMapRightClick')
                }));
            }
        },
        onOpen: function() {
            this.pointGraphics.show();
            if (!this.panorama || !this.panoramaService) {
                this.panorama = new google.maps.StreetViewPanorama(this.panoNode, this.panoOptions);
                this.panoramaService = new google.maps.StreetViewService();
                if (this.parentWidget) {
                    this.own(aspect.after(this.parentWidget, 'resize', lang.hitch(this, function() {
                        if (this.panorama) {
                            google.maps.event.trigger(this.panorama, 'resize');
                        }
                    })));

                }
                if (this.parentWidget && this.parentWidget._dockWidget) {
                    this.own(aspect.after(this.parentWidget, '_dockWidget', lang.hitch(this, function() {
                        if (this.panorama) {
                            google.maps.event.trigger(this.panorama, 'resize');
                        }
                    })));

                }
            }
            // if (this.parentWidget.toggleable) {
            //     this.disconnectMapClick();
            // }
        },
        onClose: function() {
            this.pointGraphics.hide();
            if (this.parentWidget.toggleable) {
                this.connectMapClick();
            }
        },
        onLayoutChange: function(open) {
            if (open) {
                this.onOpen();
            } else {
                this.onClose();
            }
        },
        placePoint: function() {
            this.disconnectMapClick();
            //get map click, set up listener in post create
        },
        disconnectMapClick: function() {
            this.map.setMapCursor('crosshair');
            this.mapClickMode.current = 'streetview';
        },
        connectMapClick: function() {
            this.map.setMapCursor('auto');
            this.mapClickMode.current = this.mapClickMode.defaultMode;
        },
        clearGraphics: function() {
            this.pointGraphics.clear();
            domStyle.set(this.noStreetViewResults, 'display', 'block');
            if (!this.parentWidget.toggleable) {
                this.disableStreetViewClick();
            }
        },
        enableStreetViewClick: function() {
            this.disconnectMapClick();
        },
        disableStreetViewClick: function() {
            this.connectMapClick();
        },
        getStreetView: function(evt, overRide) {
            if (this.mapClickMode.current === 'streetview' || overRide) {
                // if (!this.parentWidget.toggleable) {
                // this.disableStreetViewClick();
                // }
                var mapPoint = evt.mapPoint;
                if (!mapPoint) {
                    return;
                }

                // convert the map point's coordinate system into lat/long
                var geometry = null,
                    wkid = mapPoint.spatialReference.wkid;
                if (wkid === 102100) {
                    wkid = 3857;
                }
                var key = this.proj4Catalog + ':' + wkid;
                if (!proj4.defs[key]) {
                    var url = this.proj4CustomURL || this.proj4BaseURL + 'ref/' + this.proj4Catalog.toLowerCase() + '/' + wkid + '/proj4js/';
                    require([url], lang.hitch(this, 'getStreetView', evt, true));
                    return;
                }
                // only need one projection as we are
                // converting to WGS84 lat/long
                var projPoint = proj4(proj4.defs[key]).inverse([mapPoint.x, mapPoint.y]);
                if (projPoint) {
                    geometry = {
                        x: projPoint[0],
                        y: projPoint[1]
                    };
                }

                if (geometry) {
                    domStyle.set(this.noStreetViewResults, 'display', 'none');
                    domStyle.set(this.loadingStreetView, 'display', 'inline-block');
                    this.getPanoramaLocation(geometry);
                } else {
                    this.setPanoPlace = null;
                    this.clearGraphics();
                    domStyle.set(this.noStreetViewResults, 'display', 'block');
                }
            }

        },
        getPanoramaLocation: function(geoPoint) {
            var place = new google.maps.LatLng(geoPoint.y, geoPoint.x);
            this.panoramaService.getPanoramaByLocation(place, 50, lang.hitch(this, 'getPanoramaByLocationComplete', geoPoint));
            // Panorama Events -- Changed location
            google.maps.event.addListener(this.panorama, 'position_changed', lang.hitch(this, 'setPlaceMarkerPosition'));
            // Panorama Events -- Changed Rotation
            google.maps.event.addListener(this.panorama, 'pov_changed', lang.hitch(this, 'setPlaceMarkerRotation'));
        },
        getPanoramaByLocationComplete: function(geoPoint, StreetViewPanoramaData, StreetViewStatus) {
            domStyle.set(this.loadingStreetView, 'display', 'none');
            if (StreetViewStatus === 'OK') {
                this.disableStreetViewClick();
                var place = new google.maps.LatLng(geoPoint.y, geoPoint.x);
                this.setPanoPlace = place;
                this.firstSet = true;
                this.panorama.setPosition(place);
            } else if (StreetViewStatus === 'ZERO_RESULTS') {
                this.setPanoPlace = null;
                this.clearGraphics();
                // reset default map click mode
                this.connectMapClick();
                domStyle.set(this.noStreetViewResults, 'display', 'block');
            } else {
                this.setPanoPlace = null;
                this.clearGraphics();
                console.log('StreetView error unknown.');
            }
        },
        setPlaceMarkerPosition: function() {
            if (!this.placeMarker || this.pointGraphics.graphics.length === 0) {
                this.placeMarker = new Graphic();
                // Add graphic to the map
                this.pointGraphics.add(this.placeMarker);
            }
            // get the new lat/long from streetview
            var panoPosition = this.panorama.getPosition();
            var positionLat = panoPosition.lat();
            var positionLong = panoPosition.lng();
            // Make sure they are numbers
            if (!isNaN(positionLat) && !isNaN(positionLong)) {
                // convert the resulting lat/long to the map's spatial reference
                var xy = null,
                    wkid = this.map.spatialReference.wkid;
                if (wkid === 102100) {
                    wkid = 3857;
                }
                var key = this.proj4Catalog + ':' + wkid;
                if (!proj4.defs[key]) {
                    var url = this.proj4CustomURL || this.proj4BaseURL + 'ref/' + this.proj4Catalog.toLowerCase() + '/' + wkid + '/proj4js/';
                    require([url], lang.hitch(this, 'setPlaceMarkerPosition'));
                    return;
                }
                // only need the one projection as we are
                // converting from WGS84 lat/long
                xy = proj4(proj4.defs[key]).forward([positionLong, positionLat]);
                if (xy) {
                    var point = new Point(xy, new SpatialReference({
                        wkid: wkid
                    }));

                    // change point position on the map
                    this.placeMarker.setGeometry(point);
                    if (this.setPanoPlace && !this.firstSet) {
                        var heading = google.maps.geometry.spherical.computeHeading(panoPosition, this.setPanoPlace);
                        this.panorama.setPov({
                            heading: heading,
                            pitch: 0
                        });
                        setTimeout(lang.hitch(this, function() {
                            this.setPanoPlace = null;
                        }), 1000);
                    } else {
                        this.firstSet = false;
                    }
                }
            }
        },
        setPlaceMarkerRotation: function() {
            if (this.placeMarker) {
                var pov = this.panorama.getPov();
                this.pointSymbol.setAngle(pov.heading);
                this.pointGraphics.refresh();
            }
        },
        streetViewFromMapRightClick: function() {
            if (this.parentWidget && !this.parentWidget.open) {
                this.parentWidget.toggle();
            }
            var evt = {
                mapPoint: this.mapRightClickPoint
            };
            this.getStreetView(evt, true);
        }
    });
});