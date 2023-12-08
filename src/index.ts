import { Argv, Bot, Context, Dict, Element, Fragment, MessageEncoder, Schema, Session, Universal } from 'koishi'

declare module 'koishi' {
  interface Events {
    'execute/send'(content: Session, options: Universal.SendOptions): Promise<void>
  }

  interface Context {
    execute(this: Context, content: string, bot?: Bot<Context>): Promise<Fragment>
    execute(this: Context, argv: Argv, bot?: Bot<Context>): Promise<Fragment>
  }
}

export const name = 'execute'
export const inject = ['database']

export interface Config {}

export const Config: Schema<Config> = Schema.object({})

const platform = '_execute'

class ExecuteMessageEncoder extends MessageEncoder<Context, ExecuteBot> {
  children: Element[] = []

  async flush(): Promise<void> {
    const session = this.bot.session()
    session.elements = this.children
    this.bot.ctx.emit('execute/send', session, this.options)
    this.children = []
  }

  async visit(element: Element) {
    this.children.push(element)
  }
}

class ExecuteBot extends Bot<Context> {
  static MessageEncoder = ExecuteMessageEncoder

  constructor(ctx: Context, config?: any) {
    super(ctx, config)
    this.platform = platform
    this.hidden = true
    this.selfId = '@self'
  }
}

export function apply(ctx: Context) {
  ctx.plugin(ExecuteBot)

  ctx.on('execute/send', async (session, options) => {
    _map[options.session.messageId]?.(session.content)
    delete _map[options.session.messageId]
  })

  let _messageId = 0
  const _map: Dict<(content: Fragment) => void> = Object.create(null)

  ctx.provide('execute')
  ctx.execute = async function execute(this: Context, command: any, bot?: Bot<Context>) {
    bot ??= this.bots.find(bot => bot.platform === platform)
    const id = `${++_messageId}`
    const session = bot.session({
      message: { id },
      user: { id: '@recv' },
      channel: { id: '@default', type: Universal.Channel.Type.TEXT },
    })
    const user = await session.observeUser(['authority'])
    user.authority = 5
    return await new Promise<Fragment>((resolve, reject) => {
      _map[id] = resolve
      session.execute(command).then(x => id in _map && resolve(x)).catch(reject)
    })
  }
}
