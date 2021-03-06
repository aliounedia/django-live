

window.debug = true;

// usage: log('inside coolFunc', this, arguments);
// paulirish.com/2009/log-a-lightweight-wrapper-for-consolelog/
window.log = function(){
  if (window.debug) {
  log.history = log.history || [];   // store logs to an array for reference
  log.history.push(arguments);
  if(this.console) {
    arguments.callee = arguments.callee.caller;
    var newarr = [].slice.call(arguments);
    (typeof console.log === 'object' ? log.apply.call(console.log, console, newarr) : console.log.apply(console, newarr));
  }
  socket.emit("log", newarr);
}};

// window.socket = io.connect(window.socket_endpoint);
// log("windo info");
// log(window.location.host);
// window.socket = io.connect('http://localhost:8000');
window.socket = io.connect("http://" + window.location.host);
// window.socket = io.connect('http://route.heroku.com:24722')
// log(window.socket);

socket.emit("testemit", {test:"data"});
socket.emit("identify", {'identifier':$.cookie("sessionid")});

// log("app loading");


var ColorChoice = Backbone.Model.extend({
    urlRoot: 'color',
    noIoBind: false,
    socket: window.socket,

    initialize: function () {
       _.bindAll(this, 'serverChange', 'serverDelete', 'modelCleanup');

        /*!  if we are creating a new model to push to the server we don't want to
        * iobind as we only bind new models from the server. This is because the
        * server assigns the id.
        */
        if (!this.noIoBind) {
            this.ioBind('update', this.serverChange, this);
            this.ioBind('delete', this.serverDelete, this); }
    },

    defaults: function() {
        return{
            color_choice: "#000000",
            name: "unnamed user",
            identifier: "",
            email: ""
        };
    },

    save: $.throttle(300, function(){
        Backbone.Model.prototype.save.call(this);
    }),

    serverChange: function (data) {
    // Useful to prevent loops when dealing with client-side updates (ie: forms).
    log('model: getting server change for ' + this.get('name'));
    log(data);
    data.fromServer = true;
    this.set(data);
    // saving at this point would cause a loop
    this.change();
  },

  serverDelete: function (data) {
    log("serverDelete in model");
    if (this.collection) {
    log('has collection');
      this.collection.remove(this);
    } else {
    log('has NO collection');
      this.trigger('remove', this);
    }
    this.modelCleanup();
  },

  modelCleanup: function () {
    this.ioUnbindAll();
    return this;
  },

});

var ColorCollection = Backbone.Collection.extend({
    model: ColorChoice,
    socket:window.socket,

    // url: "connected_users",
    // url: "all",

    initialize: function (curl) {
        log("initialize collection");
        this.url = curl,
        _.bindAll(this, 'serverCreate', 'collectionCleanup', 'serverDelete', 'serverReset');
        this.ioBind('create', this.serverCreate, this);
        this.ioBind('delete', this.serverDelete, this);
        this.ioBind('refresh', this.serverReset, this);
        socket.emit("subscribe", {url:this.url});
    },

  add: function (model) {
    var exists = this.get(model.id);
    if (!exists) {
        Backbone.Collection.prototype.add.call(this, model);
    } else {
        log("model found to exist in collection " + model.name);
    }
  },

  serverReset: function (data) {
      log("serverReset-refresh");
      log(data);
      this.reset();
      this.reset(data);
  },

  serverDelete: function (data) {
      log("collection serverDelete");
      log(data);
    // seems to be buggy here - color not always detected as part of collection
    log(this.size());
    log(this);
    var exists = this.get(data.id);
    if (exists) {
        // maybe remove is tolerant of removing a non-existant model?
        this.remove(data);
        } else {
          log("couldn't find color in collection");
          log(this.url);
          log(this);
          log(this.models);
          this.remove(data);
        }
  },

  serverCreate: function (data) {
    // make sure no duplicates, just in case
    log('serverCreate');
    log(data);
    if (data instanceof Array) {
        log("have array of objects");
        data.map(function (item, i, ar){
            this.add(item);
        }, this);
        return true;
    }
    var exists = this.get(data.id);
    if (!exists) {
      this.add(data);
    } else {
      log("model already detected in collection");
      data.fromServer = true;
      exists.set(data);
    }
  },

  // reset: function () {
      // log("reset collection" + this.url);
      // log(this.size());
  // },

  collectionCleanup: function (callback) {
    this.ioUnbindAll();
    this.each(function (model) {
      model.modelCleanup();
    });
    return this;
  }
});

var ColorChoiceView = Backbone.View.extend({
    tagName: "li",

    initialize: function(){
        _.bindAll(this, "render");
        this.model.bind('change', this.render);
    },

    template: _.template($('#item-template').html()),

    events: {},

    render: function () {
        this.$el.html(this.template(this.model.toJSON()));
        return this;},

});

var MyColorChoiceView = Backbone.View.extend({
    // the view to handle current users color choice
    tagName: "div",

    initialize: function(){
        _.bindAll(this, "render");
        this.model.bind('change', this.render);
    },

    template: _.template($('#mychoice-template').html()),

    render: function () {
        // log("rendering mycolor");
        this.$el.html(this.template(this.model.toJSON()));

        $("#mycolor-display").on("click", (function(){
            $("#id_color_choice").triggerHandler("focus");
            }));

        $("#mycolor-name").change(_.bind(function (e){
            this.model.set("name", $("#mycolor-name").val());
            this.model.save();
        }, this));
        // log("done rendering mycolor");
        return this;},

});

var ArrayView = Backbone.View.extend({

    mycolorid: parseInt($.cookie('colorid')),

    initialize: function() {
        this.collection.on('add', this.addOne, this);
        this.collection.on('remove', this.removeOne, this);
        // array.on('all', this.render, this);
        //this.collection.on("reset", function() { this.addAll() }, this);
        log("Fetching choices");
        this.collection.fetch();
        log("settings up checkbox");

        // set up the connected user filter
        $("#current-user-filter").click(_.bind(function(e) {
            log("checkbox clicked");
            var ischecked = $("#current-user-filter").is(":checked");
            window.socket.emit("currentuser", {"showonly": ischecked});
            // this.collection.reset();
            // log(this.collection);
            this.$el.empty();
            this.collection.reset();
            this.collection.fetch();
            // this.render();
        }, this));

        // change collection
        $(".collection-button").click(_.bind(function(e) {
            log("collection button clicked");
            // log(e);
            var new_url = $(e.target).val();
            this.$el.empty();
            // this.collection.reset();

// This is one way of handling it, to creat a new collection
            // this.collection = new ColorCollection(new_url);
            // this.collection.fetch();
            //
            window.socket.emit('setcollection', {'url':new_url});
            log("new url for collection: " + this.collection.url);
            this.collection.reset();
            this.collection.fetch();
// this is another way - trying to swap out the url
            // this.collection.url = new_url;
            // this.collection.reset();

            // this.collection.reset();
            // this.collection.fetch({'success':_.bind(
                    // function(collection, response){
                        // log("fetch sucess callback in colleciton change");
                        // this.render();
                    // }, this)});
            // log(this.collection.models);
            // this.render();
        }, this));
    },

    addOne: function(choiceItem) {

        log("ArrayView.addOne colorchoice: " + choiceItem.url());
        socket.emit("subscribe", {url:choiceItem.url()});

        if (choiceItem.id != this.mycolorid){
            var view = new ColorChoiceView({model:choiceItem});
            this.$el.append(view.render().el);
        } else {
            log("my color");
            var view = new MyColorChoiceView({model:choiceItem});
            $("#mycolor").html(view.render().el);

            $("#id_color_choice").val(choiceItem.get("color_choice"));
            $("#mycolor-name").change(function (e){
                choiceItem.set("name", $("#mycolor-name").val());
                choiceItem.save();
            });

            $(".colorpicker").miniColors({
                change: function(hex, rgb){
                    choiceItem.set("color_choice", hex);
                    choiceItem.save();
                    // $("#mycolor-display").css("background-color", hex);
                    }
                    });

            $("#mycolor-display").on("click", (function(){
                $("#id_color_choice").triggerHandler("focus");
                }));

        }
    },

    addAll: function() {
        log(this); // == Window /colors/app/
        log(this.url); // == Window /colors/app/
        log("in addAll")
        log(this.collection.length)
        this.collection.each(this.addOne.bind(this));
    },

    removeOne: function(colorchoice) {
        log("remove one");
        this.$("#color-" + colorchoice.id).parent().remove();
    }

});


$(function(){
    log("app init started");
    var colorlist = new ColorCollection('all');

    new ArrayView({
        el:$("#color-choices-list"),
        collection: colorlist,
    });
    $("#all-button").button('toggle');
    log("app init done");
    });
