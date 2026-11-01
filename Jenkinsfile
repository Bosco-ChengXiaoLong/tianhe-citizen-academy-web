pipeline {
    agent any
    tools { nodejs 'node22' }
    options {
        disableConcurrentBuilds()
        timestamps()
        timeout(time: 30, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '10'))
    }
    parameters {
        booleanParam(name: 'DEPLOY', defaultValue: true, description: 'Publish on this Docker-capable Jenkins agent')
        booleanParam(name: 'RUN_BROWSER_TESTS', defaultValue: true, description: 'Run Chromium regression before publish')
    }
    triggers { githubPush() }
    stages {
        stage('Check, build and publish admin') {
            steps { sh 'sh admin/deploy/jenkins-build.sh' }
        }
    }
    post {
        always { archiveArtifacts artifacts: 'admin/output/**/*.json,admin/output/**/*.png', allowEmptyArchive: true }
    }
}
