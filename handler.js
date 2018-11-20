const AWS = require('aws-sdk')

const {configurator} = require('./configurator');

async function eventHandler(event, context) {
  const {platform} = configurator(arguments);
  const formulaInstance = await platform.getFormulasInstanceByInstanceId(process.env.FORMULA_INSTANCE_ID).run()
  const formula = await platform.getFormulaById(formulaInstance.formula.id).run()
  const stepTypes = formula.steps.reduce((accumulator, currentValue) => {accumulator[currentValue.name] = currentValue.type;return accumulator}, {})
  const executions = await platform.getFormulasInstancesExecutions(process.env.FORMULA_INSTANCE_ID).pageSize(200).run()
  const now = new Date();
  const interval = process.env.INTERVAL_IN_MINUTES*60*1000
  console.log(now)
  const start = new Date(now.getTime() - interval - now.getTime()%interval)
  const end = new Date(start.getTime() + interval)
  console.log(start)
  console.log(end)
  let totalOverlap = 0
  let totalOverlapping = 0
  let totalExecutionStarts = 0
  let totalSteps = 0
  let totalFailedRequestSteps = 0
  let totalFailedScriptSteps = 0
  for (let execution of executions) {
    const executionStart = new Date(execution.createdDate)
    const executionEnd = new Date(execution.updatedDate)
    if (executionStart > start && executionStart < end) {
      totalExecutionStarts++
    }
    if (executionStart < end && executionEnd > start) {
      totalOverlapping++
      const executionOverlap = Math.min(end.getTime(), executionEnd.getTime()) - Math.max(start.getTime(), executionStart.getTime())
      totalOverlap += executionOverlap
      const stepExecutions = await platform.getFormulasInstancesExecutionsSteps(execution.id).run()
      for (let stepExecution of stepExecutions) {
        const createdDate = new Date(stepExecution.createdDate)
        if (createdDate > start && createdDate < end) {
          totalSteps++
          if (stepExecution.status === 'failed' && stepTypes[stepExecution.stepName] === 'script') {
            totalFailedScriptSteps++
          }
          if (stepExecution.status === 'failed' && stepTypes[stepExecution.stepName] === 'elementRequest') {
            totalFailedRequestSteps++
          }
        }
      }
    }
  }
  if (context.invokedFunctionArn) {
    const region = context.invokedFunctionArn.split(':')[3]
    const cloudwatch = new AWS.CloudWatch({region})
    return cloudwatch.putMetricData({Namespace: formulaInstance.name, MetricData: [
      {
        Timestamp: end,
        MetricName: 'load',
        Unit: 'None',
        Value: 100.0*totalOverlap/interval
      },
      {
        Timestamp: end,
        MetricName: 'executionStarts',
        Unit: 'None',
        Value: totalExecutionStarts
      },
      {
        Timestamp: end,
        MetricName: 'steps',
        Unit: 'None',
        Value: totalSteps
      },
      {
        Timestamp: end,
        MetricName: 'failedRequestSteps',
        Unit: 'None',
        Value: totalFailedRequestSteps
      },
      {
        Timestamp: end,
        MetricName: 'failedScriptSteps',
        Unit: 'None',
        Value: totalFailedScriptSteps
      }
    ]}).promise()
  }
}

module.exports.eventHandler = eventHandler;
