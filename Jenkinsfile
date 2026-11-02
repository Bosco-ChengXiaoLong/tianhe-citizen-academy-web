pipeline {
    agent any

    tools {
        jdk 'jdk8'
        maven 'maven3'
    }

    options {
        disableConcurrentBuilds()
        timestamps()
        timeout(time: 30, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '10'))
    }

    stages {
        stage('构建与测试') {
            steps {
                sh 'mvn -B -ntp clean verify'
            }
        }

        stage('确认发布') {
            steps {
                input message: '确认发布学苑 Java 服务？'
            }
        }

        stage('部署') {
            steps {
                withCredentials([
                    file(
                        credentialsId: 'qingmu-server-prod-env',
                        variable: 'DEPLOY_ENV_FILE'
                    )
                ]) {
                    sh 'BUILD_VERIFIED=true sh deploy/jenkins-build.sh'
                }
            }
        }
    }

    post {
        always {
            junit testResults: 'target/surefire-reports/*.xml',
                  allowEmptyResults: true
        }
        success {
            archiveArtifacts artifacts: 'target/qingmu-academy-server-*.jar,target/release.properties',
                             fingerprint: true
        }
    }
}