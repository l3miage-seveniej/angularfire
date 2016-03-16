/// <reference path="../../manual_typings/manual_typings.d.ts" />

import {expect, describe,it,beforeEach} from 'angular2/testing';
import {Injector, provide, Provider} from 'angular2/core';
import {Observable} from 'rxjs/Observable'
import {
  FIREBASE_PROVIDERS,
  FirebaseRef,
  FirebaseUrl,
  FirebaseAuth,
  AuthMethods,
  FirebaseAuthState,
  firebaseAuthConfig,
  AuthProviders
} from '../angularfire2';
import {AuthBackend} from './auth_backend';
import {FirebaseSdkAuthBackend} from './firebase_sdk_auth_backend';
import * as Firebase from 'firebase';
import * as mockPromises from 'mock-promises';

describe('FirebaseAuth', () => {
  let injector: Injector = null;
  let ref: Firebase = null;
  let authData: any = null;
  let authCb: any = null;
  let backend: AuthBackend = null;

  const providerMetadata = {
    accessToken: 'accessToken',
    displayName: 'github User',
    username: 'githubUsername',
    id: '12345'
  }

  const authObj = {
    token: 'key'
  }

  const authState = {
    provider: 'github',
    uid: 'github:12345',
    github: providerMetadata,
    auth: authObj 
  };

  const AngularFireAuthState = {
    provider: AuthProviders.Github,
    uid: 'github:12345',
    github: providerMetadata,
    auth: authObj
  }

  beforeEach (() => {
    authData = null;
    authCb = null;
    injector = Injector.resolveAndCreate([
      provide(FirebaseUrl, {
        useValue: 'ws://localhost.firebaseio.test:5000'
      }),
      FIREBASE_PROVIDERS
    ]);

  });


  it('should be an observable', () => {
    expect(injector.get(FirebaseAuth)).toBeAnInstanceOf(Observable);
  })

  describe('AuthState', () => {

    beforeEach(() => {
      ref = injector.get(FirebaseRef);
      spyOn(ref, 'onAuth').and.callFake((fn: (a: any) => void) => {
        authCb = fn;
        if (authCb !== null) {
          authCb(authData);
        }
      });
      backend = new FirebaseSdkAuthBackend(ref);
    });
    function updateAuthState(_authData: any): void {
      authData = _authData;
      if (authCb !== null) {
        authCb(authData);
      }
    }

    it('should synchronously load firebase auth data', () => {
      updateAuthState(authState);
      let nextSpy = jasmine.createSpy('nextSpy');
      let auth = injector.get(FirebaseAuth);

      auth.subscribe(nextSpy);
      expect(nextSpy).toHaveBeenCalledWith(AngularFireAuthState);
    });

    it('should be null if user is not authed', () => {
      let nextSpy = jasmine.createSpy('nextSpy');
      let auth = injector.get(FirebaseAuth);

      auth.subscribe(nextSpy);
      expect(nextSpy).toHaveBeenCalledWith(null);
    });

    it('should emit auth updates', (done: () => void) => {
      let nextSpy = jasmine.createSpy('nextSpy');
      let auth = injector.get(FirebaseAuth);

      auth.subscribe(nextSpy);
      expect(nextSpy).toHaveBeenCalledWith(null);
      setTimeout(() => {
        nextSpy.calls.reset();

        updateAuthState(authState);
        expect(nextSpy).toHaveBeenCalledWith(AngularFireAuthState);
        done();
      }, 1);
    });
  });

  function getArgIndex(callbackName: string): number {
    //In the firebase API, the completion callback is the second argument for all but a few functions.
    switch (callbackName){
      case 'authAnonymously':
      case 'onAuth':
        return 0;
      case 'authWithOAuthToken':
        return 2;
      default :
        return 1;
    }
  }

  // calls the firebase callback
  function callback(callbackName: string, callIndex?: number): Function{
    callIndex = callIndex || 0; //assume the first call.
    var argIndex = getArgIndex(callbackName);
    return (<any> ref)[callbackName].calls.argsFor(callIndex)[argIndex];
  }

  describe ('firebaseAuthConfig', () => {
    beforeEach(() => {
      ref = jasmine.createSpyObj('ref',
        ['authWithCustomToken','authAnonymously','authWithPassword',
          'authWithOAuthPopup','authWithOAuthRedirect','authWithOAuthToken',
          'unauth','getAuth', 'onAuth', 'offAuth',
          'createUser','changePassword','changeEmail','removeUser','resetPassword'
        ]);
        backend = new FirebaseSdkAuthBackend(ref);
    });

    it('should return a provider', () => {
      expect(firebaseAuthConfig({method: AuthMethods.Password})).toBeAnInstanceOf(Provider);
    });

    it('should use config in login', () => {
      let config= {
        method: AuthMethods.Anonymous
      };
      let auth = new FirebaseAuth(backend, config);
      auth.login();
      expect(ref.authAnonymously).toHaveBeenCalled();
    });

    it('should pass options on to login method', () => {
      let config = {
        method: AuthMethods.Anonymous,
        remember: 'default'
      };
      let auth = new FirebaseAuth(backend, config);
      auth.login();
      expect(ref.authAnonymously).toHaveBeenCalledWith(jasmine.any(Function), {remember: 'default'});
    });

    it('should be overridden by login\'s arguments', () => {
      let config = {
        method: AuthMethods.Anonymous
      };
      let auth = new FirebaseAuth(backend, config);
      auth.login({
        method: AuthMethods.Popup,
        provider: AuthProviders.Google
      });
      expect(ref.authWithOAuthPopup).toHaveBeenCalledWith('google', jasmine.any(Function), {});
    });

    it('should be merged with login\'s arguments', () => {
      let config = {
        method: AuthMethods.Popup,
        provider: AuthProviders.Google,
        scope: ['email']
      };
      let auth = new FirebaseAuth(backend, config);
      auth.login({
        provider: AuthProviders.Github
      });
      expect(ref.authWithOAuthPopup).toHaveBeenCalledWith('github', jasmine.any(Function), {
        scope: ['email']
      });
    });
  });

  describe ('login', () => {
    let auth: FirebaseAuth = null;
    let result: any = null;
    let failure: any = null;
    let status: string = null;

    beforeEach(() => {
      ref = jasmine.createSpyObj('ref',
        ['authWithCustomToken','authAnonymously','authWithPassword',
          'authWithOAuthPopup','authWithOAuthRedirect','authWithOAuthToken',
          'unauth','getAuth', 'onAuth', 'offAuth',
          'createUser','changePassword','changeEmail','removeUser','resetPassword'
        ]);
      backend = new FirebaseSdkAuthBackend(ref);
      auth = new FirebaseAuth(backend);

      result = null;
      status = null;
      failure = null;
      mockPromises.reset();
      Promise = mockPromises.getMockPromise(Promise);
    });

    // sets state variables based on promise result
    function wrapPromise<T> (promise: Promise<T>): Promise<T> {
      promise.then(function(_result_){
        status = 'resolved';
        result = _result_;
      },function(_failure_){
        status = 'rejected';
        failure = _failure_;
      });
      return promise;
    }

    it('should reject if password is used without credentials', () => {
      let config = {
        method: AuthMethods.Password
      };
      let auth = new FirebaseAuth(backend, config);
      let promise = wrapPromise(auth.login());
      mockPromises.executeForPromise(promise);
      expect(failure).not.toBeNull();
    });

    it('should reject if custom token is used without credentials', () => {
      let config = {
        method: AuthMethods.CustomToken
      };
      let auth = new FirebaseAuth(backend, config);
      let promise = wrapPromise(auth.login());
      mockPromises.executeForPromise(promise);
      expect(failure).not.toBeNull();
    });

    it('should reject if oauth token is used without credentials', () => {
      let config = {
        method: AuthMethods.OAuthToken
      };
      let auth = new FirebaseAuth(backend, config);
      let promise = wrapPromise(auth.login());
      mockPromises.executeForPromise(promise);
      expect(failure).not.toBeNull();
    });

    it('should reject if popup is used without a provider', () => {
      let config = {
        method: AuthMethods.Redirect
      };
      let auth = new FirebaseAuth(backend, config);
      let promise = wrapPromise(auth.login());
      mockPromises.executeForPromise(promise);
      expect(failure).not.toBeNull();
    });

    it('should reject if redirect is used without a provider', () => {
      let config = {
        method: AuthMethods.Popup
      };
      let auth = new FirebaseAuth(backend, config);
      let promise = wrapPromise(auth.login());
      mockPromises.executeForPromise(promise);
      expect(failure).not.toBeNull();
    });

    describe('authWithCustomToken', () => {
      let options = {
        remember: 'default',
        method: AuthMethods.CustomToken
      };
      let credentials = {
        token: 'myToken'
      };

      it('passes custom token to underlying method', () => {
        auth.login(credentials, options);
        expect(ref.authWithCustomToken)
        .toHaveBeenCalledWith('myToken', jasmine.any(Function), {remember: 'default'});
      });

      it('will reject the promise if authentication fails',function() {
        let promise = wrapPromise(auth.login(credentials, options));
        callback('authWithCustomToken')('myError');
        mockPromises.executeForPromise(promise);
        expect(failure).toEqual('myError');
      });

      it('will resolve the promise upon authentication',function() {
        let promise = wrapPromise(auth.login(credentials, options));
        callback('authWithCustomToken')(null, authState);
        mockPromises.executeForPromise(promise);
        expect(result).toEqual(AngularFireAuthState);
      });
    });

    describe('authAnonymously',function(){
      let options = {
        remember: 'default',
        method: AuthMethods.Anonymous
      };
      it('passes options object to underlying method',function(){
        auth.login(options);
        expect(ref.authAnonymously).toHaveBeenCalledWith(jasmine.any(Function), {remember: 'default'});
      });

      it('will reject the promise if authentication fails',function(){
        let promise = wrapPromise(auth.login(options));
        callback('authAnonymously')('myError');
        mockPromises.executeForPromise(promise);
        expect(failure).toEqual('myError');
      });

      it('will resolve the promise upon authentication',function(){
        let promise = wrapPromise(auth.login(options));
        callback('authAnonymously')(null, authState);
        mockPromises.executeForPromise(promise);
        expect(result).toEqual(AngularFireAuthState);
      });
    });

    describe('authWithPassword',function(){
      let options = {remember: 'default', method: AuthMethods.Password};
      let credentials = {email:'myname', password:'password'};

      it('passes options and credentials object to underlying method',function(){
        auth.login(credentials, options);
        expect(ref.authWithPassword).toHaveBeenCalledWith(
          credentials,
          jasmine.any(Function),
          {remember: options.remember}
        );
      });

      it('will revoke the promise if authentication fails', function(){
        let promise = wrapPromise(auth.login(credentials, options));
        callback('authWithPassword')('myError');
        mockPromises.executeForPromise(promise);
        expect(failure).toEqual('myError');
      });

      it('will resolve the promise upon authentication', function(){
        let promise = wrapPromise(auth.login(credentials, options));
        callback('authWithPassword')(null, authState);
        mockPromises.executeForPromise(promise);
        expect(result).toEqual(AngularFireAuthState);
      });
    });

    describe('authWithOAuthPopup',function(){
      let options = {
        method: AuthMethods.Popup,
        provider: AuthProviders.Github
      };
      it('passes provider and options object to underlying method', function(){
        let customOptions = Object.assign ({}, options);
        customOptions.scope = ['email'];
        auth.login(customOptions);
        expect(ref.authWithOAuthPopup).toHaveBeenCalledWith(
          'github',
          jasmine.any(Function),
          {scope: ['email']}
        );
      });

      it('will reject the promise if authentication fails', function(){
        let promise = wrapPromise(auth.login(options));
        callback('authWithOAuthPopup')('myError');
        mockPromises.executeForPromise(promise);
        expect(failure).toEqual('myError');
      });

      it('will resolve the promise upon authentication', function(){
        let promise = wrapPromise(auth.login(options));
        callback('authWithOAuthPopup')(null, authState);
        mockPromises.executeForPromise(promise);
        expect(result).toEqual(AngularFireAuthState);
      });
    });

    describe('authWithOAuthRedirect',function(){
      const options = {
        method: AuthMethods.Redirect,
        provider: AuthProviders.Github
      };
      it('passes provider and options object to underlying method',function(){
        let customOptions = Object.assign({} , options);
        customOptions.scope = ['email'];
        auth.login(customOptions);
        expect(ref.authWithOAuthRedirect).toHaveBeenCalledWith(
          'github',
          jasmine.any(Function),
          {scope: ['email']}
        );
      });

      it('will reject the promise if authentication fails',function(){
        let promise = wrapPromise(auth.login(options));
        callback('authWithOAuthRedirect')('myError');
        mockPromises.executeForPromise(promise);
        expect(failure).toEqual('myError');
      });

      it('will resolve the promise upon authentication',function(){
        let promise = wrapPromise(auth.login(options));
        callback('authWithOAuthRedirect')(null,authState);
        mockPromises.executeForPromise(promise);
        expect(result).toEqual(AngularFireAuthState);
      });
    });

    describe('authWithOAuthToken',function(){
      const options = {
        method: AuthMethods.OAuthToken,
        provider: AuthProviders.Github,
        scope: ['email']
      };
      const token = 'GITHUB_TOKEN';
      const credentials = {
        token: token
      };
      it('passes provider, token, and options object to underlying method',function(){
        auth.login(credentials, options);
        expect(ref.authWithOAuthToken).toHaveBeenCalledWith(
          'github',
          token,
          jasmine.any(Function),
          {scope: ['email']}
        );
      });

      it('passes provider, OAuth credentials, and options object to underlying method',function(){
        let customOptions = Object.assign ({}, options);
        customOptions.provider = AuthProviders.Twitter;
        let twitterCredentials = {
          "user_id": "<USER-ID>",
          "oauth_token": "<ACCESS-TOKEN>",
          "oauth_token_secret": "<ACCESS-TOKEN-SECRET>"
        };
        auth.login(twitterCredentials, customOptions);
        expect(ref.authWithOAuthToken).toHaveBeenCalledWith(
          'twitter',
          twitterCredentials,
          jasmine.any(Function),
          {scope: ['email']}
        );
      });

      it('will reject the promise if authentication fails',function(){
        let creds = {
          token: ''
        };
        let promise = wrapPromise(auth.login(creds, options));
        callback('authWithOAuthToken')('myError');
        mockPromises.executeForPromise(promise);
        expect(failure).toEqual('myError');
      });

      it('will resolve the promise upon authentication',function(){
        let promise = wrapPromise(auth.login(credentials, options));
        callback('authWithOAuthToken')(null, authState);
        mockPromises.executeForPromise(promise);
        expect(result).toEqual(AngularFireAuthState);
      });
    });


    describe('unauth()',function(){
      it('will call unauth() on the backing ref if logged in',function(){
        (<any> ref).getAuth.and.returnValue({provider: 'twitter'}); auth.logout();
        expect(ref.unauth).toHaveBeenCalled();
      });

      it('will NOT call unauth() on the backing ref if NOT logged in',function(){
        (<any> ref).getAuth.and.returnValue(null);
        auth.logout();
        expect(ref.unauth).not.toHaveBeenCalled();
      });
    });
  });
});
