/*
 * grunt-release
 * https://github.com/geddski/grunt-release
 *
 * Copyright (c) 2013 Dave Geddes
 * Licensed under the MIT license.
 */

var shell = require('shelljs');
var semver = require('semver');
var _ = require('lodash');

module.exports = function(grunt){
  grunt.registerTask('release', 'bump version, git tag, git push, npm publish', function(type){

    //defaults
    var options = this.options({
      bump: true,
      file: grunt.config('pkgFile') || 'package.json',
      add: true,
      commit: true,
      tag: true,
      push: true,
      pushTags: true,
      npm : true,
      releaseFolder : null
    });

    var config = setup(options.file, type);
    var templateOptions = {
      data: {
        version: config.newVersion
      }
    };
    var tagName = grunt.template.process(grunt.config.getRaw('release.options.tagName') || '<%= version %>', templateOptions);
    var commitMessage = grunt.template.process(grunt.config.getRaw('release.options.commitMessage') || 'release <%= version %>', templateOptions);
    var tagMessage = grunt.template.process(grunt.config.getRaw('release.options.tagMessage') || 'version <%= version %>', templateOptions);
    var nowrite = grunt.option('no-write');
    var task = this;

    if (!isAllChangesCommited()) {
      grunt.fail.warn('All files should be commited before release');
    }

    if (options.releaseFolder) {
      ensureFolderInGitignore(options.releaseFolder);
      addFolder(options.releaseFolder);
    }

    if (options.bump) bump(config);
    if (options.add) add(config);
    if (options.commit) commit(config);
    if (options.tag) tag(config);
    if (options.push) push();
    if (options.pushTags) pushTags(config);
    if (options.npm) publish(config);
    if (options.github) githubRelease(config);

    function setup(file, type){
      var pkg = grunt.file.readJSON(file);
      var newVersion = pkg.version;
      if (options.bump) {
        newVersion = semver.inc(pkg.version, type || 'patch');
      }
      return {file: file, pkg: pkg, newVersion: newVersion};
    }

    function isAllChangesCommited() {
      var uncommitedFileCount = shell.exec('git status -s | wc -l');
      return uncommitedFileCount.code === 0 && uncommitedFileCount.output.replace(/(\r\n|\n|\r)/gm,'') === '0';
    }

    function ensureFolderInGitignore(folder) {
      var gitignoreContent;

      if (!shell.test('-f', '.gitignore')) {
        grunt.fail.warn('.gitignore does not exist on filesystem or not a file');
      }

      if (!shell.test('-d', folder)) {
        grunt.fail.warn('Release folder "' + folder + '" does not exist on filesystem or not directory');
      }

      try {
        gitignoreContent = grunt.file.read('.gitignore').split('\n');

        if (!_.contains(gitignoreContent, folder)) {
          gitignoreContent.unshift(folder);
          grunt.file.write('.gitignore', gitignoreContent.join('\n'));
          shell.exec('git add .gitignore');
        }
      } catch (e) {
        shell.exec('git reset --hard');
        grunt.fail.warn('failed to add folder ' + folder + ' to .gitignore' + e);
      }
    }

    function add(config){
      run('git add ' + config.file);
    }

    function commit(config){
      run('git commit -m "'+ commitMessage +'"', config.file + ' committed');
    }

    function tag(config){
      run('git tag ' + tagName + ' -m "'+ tagMessage +'"', 'New git tag created: ' + tagName);
    }

    function push(){
      run('git push', 'pushed to remote');
    }

    function pushTags(config){
      run('git push --tags', 'pushed new tag '+ config.newVersion +' to remote');
    }

    function publish(config){
      var cmd = 'npm publish';
      var msg = 'published '+ config.newVersion +' to npm';
      var npmtag = getNpmTag();
      if (npmtag){
        cmd += ' --tag ' + npmtag;
        msg += ' with a tag of "' + npmtag + '"';
      }
      if (options.folder){ cmd += ' ' + options.folder }
      run(cmd, msg);
    }

    function getNpmTag(){
      var tag = grunt.option('npmtag') || options.npmtag;
      if(tag === true) { tag = config.newVersion }
      return tag;
    }

    function run(cmd, msg){
      if (nowrite) {
        grunt.verbose.writeln('Not actually running: ' + cmd);
      }
      else {
        grunt.verbose.writeln('Running: ' + cmd);
        shell.exec(cmd, {silent:true});
      }

      if (msg) grunt.log.ok(msg);
    }

    function bump(config){
      config.pkg.version = config.newVersion;
      grunt.file.write(config.file, JSON.stringify(config.pkg, null, '  ') + '\n');
      grunt.log.ok('Version bumped to ' + config.newVersion);
    }

    function addFolder(folder){
      shell.exec('git add -f ' + folder);
    }

    function githubRelease(){
      var request = require('superagent');
      var done = task.async();

      if (nowrite){
        grunt.verbose.writeln('Not actually creating github release: ' + tagName);
        success();
      }

      request
        .post('https://api.github.com/repos/' + options.github.repo + '/releases')
        .auth(process.env[options.github.usernameVar], process.env[options.github.passwordVar])
        .set('Accept', 'application/vnd.github.manifold-preview')
        .send({"tag_name": tagName, "name": tagMessage})
        .end(function(res){
          if (res.statusCode === 201){
            success();
          }
          else {
            grunt.fail.warn('Error creating github release. Response: ' + res.text);
          }
        });

        function success(){
          grunt.log.ok('created ' + tagName + ' release on github.');
          done();
        }
    }

  });
};
